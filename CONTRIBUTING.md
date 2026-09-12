# Contribuindo

## Setup

```bash
pnpm install
pnpm docker:up               # postgres, elasticsearch, redis
cp .env.example .env         # depois ajuste os segredos
pnpm db:migrate
pnpm dev                     # api (:3001) + web (:3000)
```

Swagger UI: `http://localhost:3001/docs`.

## Comandos

```bash
pnpm test                                        # todos os testes
pnpm --filter @findremind/api test               # só a api
pnpm --filter @findremind/api test -- health     # um arquivo/filtro
pnpm --filter @findremind/api test:watch
pnpm --filter @findremind/web test               # só o front (Vitest + jsdom)
pnpm lint && pnpm typecheck                      # o CI roda isso
pnpm db:generate --name <nome>                   # gera migration a partir do schema
docker compose --profile ollama up -d            # LLM local opcional
docker compose --profile app up --build          # api + web em containers
```

## Estrutura do backend

```
apps/api/src
├── app.ts              # buildApp(): registra plugins e módulos — usado pelo server e pelos testes
├── server.ts           # entrypoint (listen + graceful shutdown)
├── config/env.ts       # loadEnv() valida process.env com Zod; nunca leia process.env fora daqui
├── plugins/            # fastify-plugin: db, redis, elasticsearch, auth, queue...
└── modules/<nome>/     # <nome>.routes.ts (HTTP), <nome>.service.ts (regra), <nome>.repository.ts (DB), <nome>.schemas.ts (Zod)
packages/db/src/schema  # uma tabela por arquivo, re-exportadas em index.ts
packages/db/drizzle     # migrations geradas (commitar sempre)
```

Regras:

- Rotas só validam/serializam e chamam services. Regra de negócio fica em services; acesso a dados em repositories.
- Toda rota tem `schema` Zod (body/query/params/response) — isso alimenta o Swagger.
- Toda rota protegida recebe `request.user` via o plugin de auth; nunca confie em `userId` vindo do body.
- Cada plugin de infra expõe um decorator (`app.db`, `app.redis`, `app.es`, `app.queues`) e fecha a conexão em `onClose`.
- Novas variáveis de ambiente: adicionar em `config/env.ts`, `.env.example`, `docker-compose.yml` e `.github/workflows/ci.yml`.
- Migrations: alterar o schema em `packages/db/src/schema`, rodar `pnpm db:generate --name <nome>`, commitar o SQL gerado. Nunca editar migration já commitada.

O Redis fica disponível em `app.redis`. Para cache de valores JSON, use `app.cache.cached(key, ttlSeconds, fn)` com TTL inteiro positivo em segundos; `fn` só executa quando a chave está ausente. Use datas como strings ISO. `app.cache.invalidate(pattern)` remove as chaves correspondentes com `SCAN`.

O Elasticsearch fica disponível em `app.es`. `remindersIndexName(app.env.NODE_ENV)`, de `apps/api/src/search/index.ts`, retorna `development-reminders`, `test-reminders` ou `production-reminders`. No boot, `ensureIndex()` cria o índice se estiver ausente e preserva índices existentes. `title` e `content` usam o analyzer `portuguese`; os subcampos `.english` usam `english`, e `title.keyword` permite correspondência exata.

Registre as filas em `apps/api/src/queues/index.ts`, associando cada nome a uma função `createProcessor(app)` que devolve o processador BullMQ. O registro começa vazio; os processadores serão adicionados nas respectivas tarefas de domínio. O plugin cria as filas em `app.queues[nome]` e usa o prefixo Redis `findremind:<NODE_ENV>`. `RUN_WORKERS` aceita `true` ou `false` e, quando omitido, habilita workers em desenvolvimento/produção e os desabilita em testes. Com `false`, as filas continuam disponíveis para envio de jobs. O encerramento espera os jobs ativos terminarem antes de fechar as filas e as conexões.

A autenticação usa Better Auth. `createAuth({ db, env })` em `apps/api/src/auth/auth.ts` monta a instância (email/senha, adapter Drizzle, campo extra `timezone` no usuário); o plugin `plugins/auth.ts` decora `app.auth` e expõe as rotas em `/api/auth/*` convertendo a request do Fastify em `Request` web. As tabelas em `packages/db/src/schema/auth.ts` devem bater com `pnpm dlx auth generate` — rode o comando ao subir a versão do Better Auth e gere migration se algo mudar.

O mesmo plugin resolve a sessão em `onRequest` (quando há cookie e a rota não é `/health*`, `/api/auth/*` ou `/docs*`) e popula `request.user` e `request.session` (`null` sem sessão). Rotas protegidas usam `app.requireAuth` como `preHandler` — em módulos inteiros, `app.addHook("preHandler", app.requireAuth)` no topo do plugin de rotas. Nos testes, `signUpAndLogin(app)` de `apps/api/test/auth.ts` cria um usuário e devolve `{ cookie, user }` prontos para o header `cookie`; `createTestApp({ configure })` permite registrar rotas extras antes do `ready()`.

O módulo `modules/reminders` segue o padrão routes → service → repository. O service valida a combinação `kind`/`remindAt`/`recurrence`, normaliza tags (`tags.ts`), calcula `nextFireAt` e devolve `404` para ids de outros usuários; o repository sempre filtra `userId` e `deletedAt is null`. A listagem usa keyset pagination sobre `(remindAt, createdAt, id)` codificada em `cursor.ts`; por isso `createdAt`/`updatedAt` são gravados pela aplicação com precisão de milissegundos, e não pelo `now()` do Postgres.

Recorrência fica em `modules/reminders/recurrence.ts`: `nextOccurrence(schedule, after, timezone)` é pura e calcula no relógio de parede do usuário (`TZDate` do `@date-fns/tz`), preservando o horário local em mudanças de horário de verão e derivando fim de mês sempre da data âncora (`remindAt` nunca muda; `nextFireAt` avança). Escreva os testes de recorrência com fusos que têm DST (`America/New_York`) além de `America/Sao_Paulo`.

O contrato dos endpoints está em [`docs/api-contract.md`](docs/api-contract.md); o roadmap do backend em [`docs/tasks/backend.md`](docs/tasks/backend.md).

## Estrutura do frontend

```
apps/web/src
├── app/                # App Router: (auth)/login|register, (app)/reminders|search|chat|alerts|settings
├── proxy.ts            # redireciona por cookie de sessão (sem sessão → /login; com sessão → /reminders)
├── components/
│   ├── ui/             # shadcn (Base UI) — gerado pelo CLI, não editar à mão
│   ├── form/           # Input, Textarea, Select e TagsInput com label flutuante
│   ├── layout/         # sidebar, navegação, cabeçalho de página
│   └── <domínio>/      # reminders, search, chat, alerts, ai, settings, auth
├── hooks/              # TanStack Query por recurso (use-reminders, use-alerts, use-ai, ...)
└── lib/                # api.ts (fetch + ApiError), auth-client.ts (Better Auth), types.ts (contrato), format.ts
```

Regras:

- Todo acesso à API passa por `lib/api.ts` (`credentials: include`, erros viram `ApiError` com `status`/`code`; `401` redireciona para o login). Os tipos em `lib/types.ts` espelham `docs/api-contract.md` — ao mudar o contrato, atualize os dois.
- Dados vêm de hooks em `hooks/` (TanStack Query). Mutations invalidam as chaves de `lib/query-keys.ts`; componentes não chamam `fetch` direto.
- Formulários usam `react-hook-form` + Zod com os primitivos de `components/form` (label flutuante; erro = borda e texto vermelhos). Selects controlados via `Controller`.
- Chat usa `useChat` do AI SDK com `DefaultChatTransport` apontando para a API; cada tool do contrato tem um renderer em `components/chat/tool-parts.tsx`.
- Datas na UI são formatadas em `lib/format.ts` (pt-BR); a API sempre recebe/entrega ISO UTC.
- Componentes novos do shadcn: `pnpm dlx shadcn@latest add <nome>` dentro de `apps/web`.

## Testes

- Vitest. Unit tests ficam ao lado do código (`*.test.ts`); integração em `apps/api/test/`. No front, `*.test.tsx` ao lado do componente com Testing Library (jsdom).
- `apps/api/test/helpers.ts` → `createTestApp()` monta o app real com `logger: false`; use `app.inject()` para testar rotas.
- Testes de integração usam Postgres/Redis/ES reais (docker compose local, services no CI). Banco de teste: `findremind_test`. Limpe as tabelas entre testes (truncate), não recrie o schema.
- Providers de IA nos testes: sempre mockados (`ai/test`). Nunca chame API externa em teste.
- Todo PR precisa manter `pnpm test`, `pnpm lint` e `pnpm typecheck` verdes.

Antes da primeira execução local, crie o banco de teste com o Postgres do compose ativo:

```bash
docker compose exec -T postgres createdb -U findremind findremind_test
```

`createTestApp()` aplica as migrations antes de disponibilizar o app. Os helpers de banco exigem `NODE_ENV=test` e o banco `findremind_test`. Use `truncateAll(app.db)` de `apps/api/test/db.ts` entre testes; ele preserva o histórico de migrations. Os arquivos de teste executam em sequência para evitar disputas por esse banco compartilhado.

Os testes do app também exigem Redis e Elasticsearch ativos (`pnpm docker:up`). Os testes de cache usam prefixos exclusivos e removem apenas suas próprias chaves ao terminar. Os testes de criação de índices usam nomes exclusivos com prefixo `test-reminders-` e removem esses índices ao terminar.

Os testes de filas registram processadores próprios e usam nomes exclusivos. Para processar jobs inline, o worker deve usar o mesmo `queuePrefix("test")` da fila e uma conexão Redis com `maxRetriesPerRequest: null`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), em inglês, validados pelo commitlint no CI:

```
<tipo>(<escopo>): <descrição no imperativo, minúscula, sem ponto final>

[corpo opcional explicando o porquê]
```

- Tipos: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `ci`, `build`, `perf`.
- Escopos: `api`, `web`, `db`, `auth`, `search`, `ai`, `chat`, `reminders`, `alerts`, `docker`, `ci`, `deps`, `repo`.
- Exemplos: `feat(auth): add better-auth with email/password`, `fix(search): invalidate cache on reminder update`.
- Um commit por tarefa (ou por sub-passo coeso). Não misture refactor com feature.
- Ao concluir um item do roadmap, marque `- [x]` em `docs/tasks/backend.md` no mesmo commit e atualize `docs/api-contract.md` se o endpoint mudou.
