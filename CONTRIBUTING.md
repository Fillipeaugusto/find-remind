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

Registre as filas em `apps/api/src/queues/index.ts`, associando cada nome a uma função `createProcessor(app)` que devolve o processador BullMQ; uma fila pode atender vários jobs distinguidos por `job.name` (veja `queues/search.ts`). Jobs repetíveis entram em `schedulers` da definição (`{ id, name, every }`) e são registrados com `upsertJobScheduler` apenas quando os workers sobem. O plugin cria as filas em `app.queues[nome]` e usa o prefixo Redis `findremind:<NODE_ENV>`. `RUN_WORKERS` aceita `true` ou `false` e, quando omitido, habilita workers em desenvolvimento/produção e os desabilita em testes. Com `false`, as filas continuam disponíveis para envio de jobs. O encerramento espera os jobs ativos terminarem antes de fechar as filas e as conexões.

A autenticação usa Better Auth. `createAuth({ db, env })` em `apps/api/src/auth/auth.ts` monta a instância (email/senha, adapter Drizzle, campo extra `timezone` no usuário); o plugin `plugins/auth.ts` decora `app.auth` e expõe as rotas em `/api/auth/*` convertendo a request do Fastify em `Request` web. As tabelas em `packages/db/src/schema/auth.ts` devem bater com `pnpm dlx auth generate` — rode o comando ao subir a versão do Better Auth e gere migration se algo mudar.

O mesmo plugin resolve a sessão em `onRequest` (quando há cookie e a rota não é `/health*`, `/api/auth/*` ou `/docs*`) e popula `request.user` e `request.session` (`null` sem sessão). Rotas protegidas usam `app.requireAuth` como `preHandler` — em módulos inteiros, `app.addHook("preHandler", app.requireAuth)` no topo do plugin de rotas. Nos testes, `signUpAndLogin(app)` de `apps/api/test/auth.ts` cria um usuário e devolve `{ cookie, user }` prontos para o header `cookie`; `createTestApp({ configure })` permite registrar rotas extras antes do `ready()`.

O módulo `modules/reminders` segue o padrão routes → service → repository. O service valida a combinação `kind`/`remindAt`/`recurrence`, normaliza tags (`tags.ts`), calcula `nextFireAt` e devolve `404` para ids de outros usuários; o repository sempre filtra `userId` e `deletedAt is null`. A listagem usa keyset pagination sobre `(remindAt, createdAt, id)` codificada em `cursor.ts`; por isso `createdAt`/`updatedAt` são gravados pela aplicação com precisão de milissegundos, e não pelo `now()` do Postgres.

Recorrência fica em `modules/reminders/recurrence.ts`: `nextOccurrence(schedule, after, timezone)` é pura e calcula no relógio de parede do usuário (`TZDate` do `@date-fns/tz`), preservando o horário local em mudanças de horário de verão e derivando fim de mês sempre da data âncora (`remindAt` nunca muda; `nextFireAt` avança). Escreva os testes de recorrência com fusos que têm DST (`America/New_York`) além de `America/Sao_Paulo`.

O índice do Elasticsearch é derivado do Postgres, nunca a fonte da verdade. Todo write em lembretes passa por `createSearchSync(app).reminderChanged(reminderId, userId)` (`search/sync.ts`), que enfileira `index-reminder` na fila `search` e invalida o cache `search:{userId}:*`; o worker (`search/indexer.ts`) relê a linha e faz `index` ou `delete` conforme ela exista e não esteja soft-deleted. Para reconstruir o índice inteiro use `pnpm --filter @findremind/api reindex` (ou o job `reindex-all`). Nos testes, `startInlineWorker(app, "search")` de `apps/api/test/queues.ts` processa a fila no próprio processo e `clearQueues(app)` remove os jobs que sobraram — chame-a no `afterAll` de qualquer teste que crie lembretes.

O mesmo write enfileira `embed-reminder`. `search/embedder.ts` gera o vetor a partir de título, conteúdo e tags ordenadas, usando o padrão de embedding do usuário. `reminder_embedding` guarda a referência completa `providerId:model`, `dims` e `vector` sem dimensão fixa; migrations habilitam pgvector e criam índices HNSW parciais para 768, 1024 e 1536 dimensões. Vetores de outras dimensões também são aceitos (até 16000). Sem provedor, o job termina com `{ action: "skipped", reason: "NO_EMBEDDING_PROVIDER" }`; erros do provedor usam as retentativas da fila e mensagens sanitizadas. A gravação verifica novamente conteúdo, provedor e padrão após a chamada externa. Edições invalidam o vetor anterior; um novo vetor invalida o cache. Alterar o padrão de embedding enfileira `reembed-user`, que agenda os lembretes ativos daquele usuário em lotes de 500.

Os alertas são disparados pelo job `scan-due-reminders` da fila `alerts` (a cada 30s). O handler `scanDueReminders(app, now)` em `apps/api/src/alerts/scheduler.ts` reivindica lembretes com `nextFireAt <= now` usando `FOR UPDATE SKIP LOCKED`, grava um `alert` com `firedAt = nextFireAt` (o índice único `(reminderId, firedAt)` absorve retentativas), avança `nextFireAt` nos recorrentes ou zera nos demais (que ficam `scheduled` aguardando o usuário), publica o alerta no canal Redis `alerts:{userId}` via `app.alertBus` (`alerts/bus.ts`, conexão dedicada de subscribe) e reindexa o lembrete. Nos testes, congele só o relógio (`vi.useFakeTimers({ now, toFake: ["Date"] })`) e chame o handler direto.

O módulo `modules/alerts` expõe a listagem (keyset em `(firedAt, id)`, `cursor.ts`), `read`/`read-all` e o stream SSE em `GET /alerts/stream`. O handler do stream faz `reply.hijack()`, copia os headers já definidos pelos hooks (CORS, helmet) no `writeHead`, assina o usuário em `app.alertBus` e encerra no `close` da request; um hook `preClose` fecha os streams abertos antes do servidor HTTP parar (senão o `close()` nunca termina). Nos testes, use `app.inject({ payloadAsStream: true })` e leia `res.stream()`; `res.raw.res.req.destroy()` simula a desconexão do cliente. Não use `vi.waitFor` com timers falsos ativos — ele avança os timers a cada checagem.

Provedores de IA ficam em `ai_provider` e os padrões por usuário em `ai_user_settings`. `createKeyCipher(env.AI_KEYS_ENCRYPTION_KEY)` (`ai/crypto.ts`) deriva uma chave com HKDF e usa AES-256-GCM com IV aleatório; preserve o segredo de criptografia para continuar lendo chaves já salvas. `createProviderRegistry(row, env)` monta os adaptadores do AI SDK 7 com as credenciais do registro, sem usar chaves globais do servidor. Anthropic não oferece embeddings. `createModelResolver(app)(userId, reference, kind)` resolve `providerId:model` ou o padrão do usuário, exigindo provedor habilitado e testado; nomes de modelos podem conter `:`. Ausência de provedor gera `NoProviderError` com status 409 e código específico de chat/embedding.

`ai/catalog.ts` mantém modelos curados, inclui modelos configurados e consulta as APIs de listagem. Provedores compatíveis que não oferecem catálogo usam a lista local. No Ollama, `/api/tags` e `/api/show` identificam os modelos instalados e suas capacidades; falha de conexão é propagada. URLs do Ollama aceitam a raiz ou o sufixo `/api`; demais provedores usam a URL da API (por exemplo, `/v1` ou `/v1beta`).

O módulo `modules/ai-providers` serializa explicitamente os campos públicos e deriva `hasApiKey`. O teste de conexão usa `generateText`/`embed` sem retentativas e sanitiza mensagens de erro. Alterações de configuração invalidam o teste anterior; exclusão, desativação ou falha também limpam padrões associados. Writes usam transação com lock por usuário e comparam `updatedAt` para impedir que uma resposta de rede valide credenciais alteradas durante a chamada; nenhum lock é mantido durante acesso à rede. Nos testes das rotas, use `MockLanguageModelV4` e `MockEmbeddingModelV4` de `ai/test` para exercitar o SDK sem chamadas externas.

O contrato dos endpoints está em [`docs/api-contract.md`](docs/api-contract.md); o roadmap do backend em [`docs/tasks/backend.md`](docs/tasks/backend.md).

`modules/search` implementa busca textual no Elasticsearch, vetorial no Postgres e fusão RRF (`search/rrf.ts`, `k=60`). Os dois mecanismos usam filtros por usuário, `remindAt`, status e todas as tags. Consultas vetoriais usam os índices por dimensão com `hnsw.iterative_scan = strict_order`; outras dimensões fazem busca exata. O cache guarda candidatos por 60s; hidratação pelo Postgres revalida os filtros mesmo em hits. O indexador aguarda visibilidade no Elasticsearch antes de invalidar o cache. Após atualizar um índice antigo que usava `nextFireAt` como data, rode `pnpm --filter @findremind/api reindex` para alinhar os filtros ao campo `remindAt` do contrato.

`search-ask.service.ts` usa `generateObject` com Zod para extrair filtros, resolve `dateExpression` por `ai/date-range.ts`, chama o mesmo service de busca híbrida e resume os resultados com `generateText`. O resolver de datas é puro (`expression`, `now`, `tz`), usa períodos locais completos e devolve limites ISO UTC inclusivos; semanas começam na segunda e `dia N` pertence ao mês atual. Ambos os modelos usam os padrões do usuário. A resposta do resumo recebe apenas resultados autorizados e trechos limitados do conteúdo; erros remotos são sanitizados. Testes usam modelos de `ai/test`, índice Elasticsearch exclusivo e relógio falso apenas para `Date`.

`modules/chat` guarda conversas (`conversation`, com o `providerId:model` fixado na criação) e mensagens no formato `UIMessage` do AI SDK (`message.parts` em jsonb; chave `(conversationId, id)` porque os ids vêm do cliente; `position` dá a ordem). `chat-stream.service.ts` usa só a última mensagem da requisição — precisa ser texto de usuário — e carrega o histórico do banco, nunca do cliente; valida tudo com `safeValidateUIMessages`, roda `streamText` com as tools de `chat/tools.ts` e `stopWhen: stepCountIs(5)`, e converte com `toUIMessageStream` + `pipeUIMessageStreamToResponse` sobre `reply.hijack()`. O `onEnd` grava a pergunta e a resposta completa (tool calls e resultados inclusos) e o título gerado em paralelo na primeira resposta; repetir o mesmo id de mensagem substitui em vez de duplicar. As tools chamam os services de lembretes/busca diretamente (busca híbrida cai para textual sem embedding), e `chat/system-prompt.ts` fixa data/hora e fuso do usuário. Erros viram eventos `error`/`tool-output-error` no stream com mensagem sanitizada por `describeStreamError`; nunca 500 depois que o stream começou. Nos testes, `MockLanguageModelV4` com `doStream` + `simulateReadableStream` alimenta o protocolo e `app.inject` devolve o SSE completo no `body`.

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
