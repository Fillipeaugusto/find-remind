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
pnpm lint && pnpm typecheck                      # o CI roda isso
pnpm db:generate -- --name <nome>                # gera migration a partir do schema
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
- Migrations: alterar o schema em `packages/db/src/schema`, rodar `pnpm db:generate -- --name <nome>`, commitar o SQL gerado. Nunca editar migration já commitada.

O contrato dos endpoints está em [`docs/api-contract.md`](docs/api-contract.md); o roadmap do backend em [`docs/tasks/backend.md`](docs/tasks/backend.md).

## Testes

- Vitest. Unit tests ficam ao lado do código (`*.test.ts`); integração em `apps/api/test/`.
- `apps/api/test/helpers.ts` → `createTestApp()` monta o app real com `logger: false`; use `app.inject()` para testar rotas.
- Testes de integração usam Postgres/Redis/ES reais (docker compose local, services no CI). Banco de teste: `findremind_test`. Limpe as tabelas entre testes (truncate), não recrie o schema.
- Providers de IA nos testes: sempre mockados (`ai/test`). Nunca chame API externa em teste.
- Todo PR precisa manter `pnpm test`, `pnpm lint` e `pnpm typecheck` verdes.

Antes da primeira execução local, crie o banco de teste com o Postgres do compose ativo:

```bash
docker compose exec -T postgres createdb -U findremind findremind_test
```

`createTestApp()` aplica as migrations antes de disponibilizar o app. Os helpers de banco exigem `NODE_ENV=test` e o banco `findremind_test`. Use `truncateAll(app.db)` de `apps/api/test/db.ts` entre testes; ele preserva o histórico de migrations. Os arquivos de teste executam em sequência para evitar disputas por esse banco compartilhado.

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
