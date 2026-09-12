# Backend — plano de tarefas

Escopo: `apps/api` e `packages/db`. Leia [`CONTRIBUTING.md`](../../CONTRIBUTING.md) (convenções) e [`docs/api-contract.md`](../api-contract.md) (contrato) antes de começar.

Regras de execução:
- Uma tarefa por PR/commit, na ordem abaixo. Marque `- [x]` ao concluir.
- Cada tarefa lista o commit esperado; use-o (ajuste se dividir em mais commits).
- Critérios de aceite são obrigatórios. "Testes" significa Vitest verde no CI.
- Versões de referência: `ai@7`, `@ai-sdk/*@4`, `ollama-ai-provider-v2@4`, `better-auth@1.7`, `bullmq@6`, `@elastic/elasticsearch@9`, `ioredis@6`. Confira a documentação da versão instalada antes de usar a API dessas libs (`node_modules/<pkg>/README.md` ou docs oficiais) — mudaram bastante entre versões.

---

## Fase 0 — Infra

### 0.1 Plugin de banco (Drizzle) — `feat(api): add drizzle database plugin`
- [x] `plugins/db.ts` com `fastify-plugin`: cria `createDb(env.DATABASE_URL)` de `@findremind/db`, decora `app.db`, fecha em `onClose`.
- [x] Rodar migrations no boot **apenas** em `NODE_ENV=test` (helper `migrateTestDb()` em `test/db.ts`) — em dev/prod migrations são manuais (`pnpm db:migrate`).
- [x] `test/db.ts`: `truncateAll(db)` para limpar tabelas entre testes.
- Aceite: `createTestApp()` sobe com Postgres real; teste que faz `SELECT 1` via `app.db`.

### 0.2 Plugin Redis — `feat(api): add redis plugin`
- [x] `plugins/redis.ts` com `ioredis`; decora `app.redis`; `onClose` → `quit()`.
- [x] Helper `cache.ts`: `cached<T>(key, ttlSeconds, fn)` + `invalidate(pattern)` (usar `SCAN`, não `KEYS`).
- Aceite: teste de `cached` (hit/miss/ttl) contra Redis real.

### 0.3 Plugin Elasticsearch — `feat(search): add elasticsearch plugin and index bootstrap`
- [x] `plugins/elasticsearch.ts` com `@elastic/elasticsearch`; decora `app.es`.
- [x] `search/index.ts`: nome do índice `reminders` (prefixo por `NODE_ENV`, ex. `test-reminders`), mapping (`title` text + `keyword`, `content` text, `tags` keyword, `remindAt`/`createdAt` date, `status` keyword, `userId` keyword) com analyzer `portuguese` + `english` (multi-field). `ensureIndex()` idempotente no boot.
- Aceite: teste que `ensureIndex()` cria e não recria; mapping validado.

### 0.4 Filas (BullMQ) — `feat(api): add bullmq queue plugin`
- [x] `plugins/queue.ts`: cria `Queue`s e `Worker`s registrados em `queues/`. Decora `app.queues`. Workers só sobem quando `env.RUN_WORKERS=true` (padrão `true` em dev, `false` em test).
- [x] Adicionar `RUN_WORKERS` em `env.ts`, `.env.example`, compose, CI.
- Aceite: teste enfileira job e processa com worker inline.

### 0.5 Readiness — `feat(api): add readiness endpoint`
- [x] `GET /health/ready` checando postgres (`select 1`), redis (`ping`), ES (`cluster.health`). `503` se algum falhar.
- Aceite: teste com serviços reais (200) e com mock quebrado (503).

---

## Fase 1 — Auth

### 1.1 Better Auth — `feat(auth): add better-auth with email/password`
- [x] `auth/auth.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true }, trustedOrigins: [env.WEB_URL], secret, baseURL })`. Campo extra `timezone` no user (`user.additionalFields`).
- [x] `plugins/auth.ts`: monta o handler do Better Auth em `/api/auth/*` (converter `FastifyRequest` → `Request` web; ver doc "Fastify integration" do Better Auth). Decora `app.auth`.
- [x] Verificar que as tabelas em `packages/db/src/schema/auth.ts` batem com o que o Better Auth espera (`npx @better-auth/cli generate` para comparar). Ajustar schema + migration se necessário.
- Aceite: teste sign-up → sign-in → get-session via `app.inject()` com cookies.

### 1.2 Guard de sessão — `feat(auth): add session guard and request.user`
- [x] `plugins/auth.ts`: hook `onRequest` que resolve a sessão via `auth.api.getSession({ headers })` e popula `request.user` / `request.session`. Decorator `app.requireAuth` (preHandler) que responde `401`.
- [x] Todas as rotas fora de `/health*` e `/api/auth/*` usam `requireAuth`.
- [x] `test/auth.ts`: `signUpAndLogin(app)` devolve cookie pronto para os testes seguintes.
- Aceite: rota protegida sem cookie → 401; com cookie → 200 e `request.user.id` correto.

### 1.3 Perfil — `feat(api): add /me endpoints`
- [x] `modules/me`: `GET /me`, `PATCH /me` (`name`, `timezone` validado contra `Intl.supportedValuesOf("timeZone")`).
- Aceite: testes de leitura e atualização; timezone inválido → 400.

---

## Fase 2 — Lembretes

### 2.1 Schema — `feat(db): add reminders, tags and alerts tables`
- [x] `schema/reminders.ts`: `reminder` (id, userId, title, content, kind, remindAt, recurrence jsonb, status, snoozedUntil, nextFireAt, createdAt, updatedAt, deletedAt), `reminder_tag` (reminderId, tag) e `alert` (id, reminderId, userId, firedAt, readAt). Índices em `(userId, status)`, `(userId, nextFireAt)`, `(reminderId, tag)`.
- [x] Migration gerada e commitada.
- Aceite: `pnpm db:migrate` aplica limpo; typecheck ok.

### 2.2 CRUD — `feat(reminders): add reminders crud`
- [x] `modules/reminders`: schemas Zod (contrato), repository, service, routes (`GET/POST /reminders`, `GET/PATCH/DELETE /reminders/:id`, `GET /tags`).
- [x] Regras: `kind=reminder` exige `remindAt`; `remindAt` no passado é permitido mas gera alerta imediato; `DELETE` é soft delete (`deletedAt`); tags normalizadas (lowercase, trim, únicas); paginação por cursor (`createdAt,id`).
- [x] Isolamento por usuário: toda query filtra `userId = request.user.id`; acessar id de outro usuário → 404.
- Aceite: testes de cada rota + isolamento + validações.

### 2.3 Estado e recorrência — `feat(reminders): add done/snooze/dismiss and recurrence`
- [x] `POST /reminders/:id/done|snooze|dismiss`.
- [x] `reminders/recurrence.ts`: `nextOccurrence(reminder, after: Date, tz: string): Date | null` puro (daily/weekly/monthly/yearly, `interval`, `byWeekday`, `until`). Usar `date-fns` + `@date-fns/tz` (ou `Temporal` se estável no Node 24).
- [x] `done` em lembrete recorrente → calcula próxima ocorrência, mantém `status=scheduled`, atualiza `nextFireAt`. Sem próxima → `done`.
- [x] `snooze` → `status=snoozed`, `nextFireAt = until`.
- Aceite: testes unitários de `nextOccurrence` (DST, fim de mês, `until`); testes das rotas.

### 2.4 Indexação no ES — `feat(search): index reminders on write`
- [x] Após create/update/delete/status: enfileira job `index-reminder` (`{ reminderId }`); worker lê do Postgres e faz `index`/`delete` no ES. Postgres é a fonte da verdade; ES é derivado.
- [x] Job `reindex-all` (usado por script `pnpm --filter @findremind/api reindex`).
- [x] Invalidar cache `search:{userId}:*` no mesmo ponto.
- Aceite: teste de integração: cria lembrete → processa fila inline → documento existe no ES; deleta → some.

---

## Fase 3 — Alertas

### 3.1 Scheduler — `feat(alerts): schedule and fire reminder alerts`
- [x] Job repetível `scan-due-reminders` a cada 30s: busca `nextFireAt <= now() AND status in (scheduled, snoozed)` (lock por `FOR UPDATE SKIP LOCKED`), cria `alert`, publica no Redis pub/sub `alerts:{userId}`, e avança `nextFireAt` (recorrente) ou marca `status=scheduled` com `nextFireAt=null` aguardando ação do usuário.
- [x] Idempotência: não criar dois alerts para a mesma ocorrência (unique `(reminderId, firedAt)` ou coluna `lastFiredAt`).
- Aceite: teste com relógio fake (`vi.useFakeTimers`) + execução direta do handler do job.

### 3.2 API de alertas + SSE — `feat(alerts): add alerts endpoints and sse stream`
- [x] `GET /alerts`, `POST /alerts/:id/read`, `POST /alerts/read-all`.
- [x] `GET /alerts/stream`: SSE (`text/event-stream`), assina `alerts:{userId}` no Redis (conexão dedicada de subscribe), `ping` a cada 25s, encerra limpo em `request.raw.on("close")`.
- Aceite: testes das rotas; teste do SSE com `app.inject` + payload streaming (ou `light-my-request` com `payloadAsStream`) recebendo pelo menos um `alert`.

---

## Fase 4 — Provedores de IA

### 4.1 Schema + criptografia — `feat(ai): add ai providers table and key encryption`
- [x] `schema/ai.ts`: `ai_provider` (id, userId, kind, label, baseUrl, apiKeyEncrypted, enabled, defaultChatModel, defaultEmbeddingModel, lastCheckedAt, lastCheckStatus, lastCheckError, createdAt, updatedAt) e `ai_user_settings` (userId pk, defaultChat, defaultEmbedding).
- [x] `ai/crypto.ts`: AES-256-GCM com `AI_KEYS_ENCRYPTION_KEY` (derivar com `scrypt`/`hkdf`), formato `v1:<iv>:<tag>:<ciphertext>` base64.
- Aceite: testes de roundtrip e de rejeição de payload adulterado; migration aplicada.

### 4.2 Registry de providers — `feat(ai): add provider registry with ai sdk`
- [x] `ai/registry.ts`: dado `ai_provider`, devolve `{ chat(modelId): LanguageModel, embedding(modelId): EmbeddingModel }` usando `createOpenAI`, `createAnthropic`, `createGoogleGenerativeAI`, `createOllama` (`ollama-ai-provider-v2`) com `baseURL`/`apiKey` do registro.
- [x] `ai/resolve.ts`: `resolveModel(userId, "providerId:model" | undefined, kind: "chat" | "embedding")` → usa o default do usuário quando não informado; erro tipado `NoProviderError` → `409 NO_EMBEDDING_PROVIDER` / `NO_CHAT_PROVIDER`.
- [x] Catálogo estático `ai/catalog.ts` com modelos curados por provider (chat + embedding) — Ollama consulta `GET {baseUrl}/api/tags` ao vivo.
- Aceite: testes unitários do registry (instancia o provider certo) e do resolve (default, explícito, ausente).

### 4.3 Endpoints — `feat(ai): add provider settings endpoints`
- [x] `modules/ai-providers`: CRUD do contrato, `POST /:id/test` (chat: `generateText` com prompt mínimo `maxOutputTokens: 5`; se tiver embedding model, `embed("ping")`), `GET /:id/models`, `GET /ai/models`, `PUT /ai/defaults`.
- [x] Nunca serializar `apiKeyEncrypted`; `hasApiKey` derivado.
- [x] `GET /ai/models` só lista providers `enabled && lastCheckStatus === "ok"` (é isso que faz o modelo "aparecer para uso" no frontend).
- Aceite: testes com modelo mockado (`ai/test`) cobrindo test ok/erro, listagem, defaults, isolamento por usuário.

---

## Fase 5 — Busca semântica

### 5.1 Embeddings — `feat(search): generate and store reminder embeddings`
- [x] `schema/reminders.ts`: `reminder_embedding` (reminderId pk, model text, dims int, embedding `vector(1536)`? → **usar `vector` sem dimensão fixa + coluna `dims`**, índice HNSW criado por migration separada por dimensão comum (1536, 768, 1024) usando índices parciais `WHERE dims = N`).
- [x] Job `embed-reminder` enfileirado junto com `index-reminder`: texto = `title + "\n" + content + tags`; usa `resolveModel(userId, undefined, "embedding")`; se não houver provider, marca job como `skipped` (sem erro).
- [x] Reembed quando `model` default muda (job `reembed-user`).
- Aceite: teste com embedding model mockado retornando vetor fixo; vetor persistido; sem provider → skip.

### 5.2 Busca híbrida — `feat(search): add keyword, semantic and hybrid search`
- [x] `modules/search`: `GET /search`.
  - `keyword`: ES `multi_match` (title^3, content, tags) + filtros (userId, from/to em `remindAt`, tags, status) + highlight.
  - `semantic`: embedding da query → pgvector `<=>` (cosine) top-K por usuário e filtros.
  - `hybrid`: roda os dois e funde com **Reciprocal Rank Fusion** (`k=60`).
- [x] Cache Redis `search:{userId}:{hash(params)}` TTL 60s; `cached: true` na resposta.
- Aceite: testes de integração para cada modo; RRF testado unitariamente; cache hit testado.

### 5.3 Pergunta em linguagem natural — `feat(search): add /search/ask with llm filter extraction`
- [x] `ai/date-range.ts`: `resolveDateRange(expression, now, tz)` para expressões comuns (hoje, ontem, semana passada, segunda passada, mês que vem, "dia 15") — determinístico, testado.
- [x] `POST /search/ask`: `generateObject` (schema Zod `{ query, from?, to?, tags?, status?, dateExpression? }`) com o chat model default; se vier `dateExpression`, resolver com `resolveDateRange` no fuso do usuário; roda `hybrid`; gera `answer` curta com `generateText` citando os itens.
- Aceite: teste unitário de `resolveDateRange` (≥ 12 casos); rota testada com LLM mockado.

---

## Fase 6 — Chat

### 6.1 Persistência — `feat(chat): add conversations and messages tables`
- [x] `schema/chat.ts`: `conversation` (id, userId, title, model, createdAt, updatedAt) e `message` (id, conversationId, role, parts jsonb (UIMessage parts), createdAt).
- [x] Rotas `GET/POST /chat/conversations`, `GET/DELETE /chat/conversations/:id`.
- Aceite: testes das rotas + isolamento.

### 6.2 Streaming — `feat(chat): stream responses with ai sdk and tools`
- [ ] `POST /chat/conversations/:id/messages`: `streamText({ model, system, messages: convertToModelMessages(messages), tools, stopWhen: stepCountIs(5) })` → `result.toUIMessageStreamResponse()` adaptado para Fastify (`reply.send(Readable.fromWeb(...))` + headers corretos). `onFinish` persiste a mensagem do usuário e a resposta (parts completos, incluindo tool calls/results). Título gerado na primeira resposta.
- [ ] `chat/tools.ts`: tools do contrato (`searchReminders`, `getReminder`, `createReminder`, `updateReminder`, `completeReminder`, `resolveDateRange`, `listTags`) reutilizando os services — nunca chamam HTTP interno.
- [ ] `chat/system-prompt.ts`: data/hora atual e fuso do usuário no prompt; instruir a usar tools para tudo que envolva dados; responder em Markdown; usar `resolveDateRange` antes de `searchReminders` quando houver expressão temporal.
- [ ] Erros de provider (chave inválida, modelo inexistente) viram evento de erro no stream com mensagem legível, não 500.
- Aceite: teste com `MockLanguageModel` (streaming) verificando o protocolo de stream e a persistência; teste de cada tool chamando o service.

---

## Fase 7 — Qualidade e operação

### 7.1 Rate limit e segurança — `feat(api): tune rate limits and security headers`
- [ ] Limites específicos: `/api/auth/sign-in` (10/min por IP), `/chat/**` (30/min por usuário), `/search/ask` (30/min por usuário). Chave por `request.user.id` quando autenticado.
- Aceite: testes de 429.

### 7.2 Observabilidade — `chore(api): add request ids and structured logs`
- [ ] `requestId` propagado (`x-request-id`), logs com `userId` quando houver, redaction de `authorization`, `cookie`, `apiKey` no pino.
- Aceite: teste que o header de resposta carrega o request id.

### 7.3 Scripts de manutenção — `chore(api): add reindex and seed scripts`
- [ ] `pnpm --filter @findremind/api reindex` (todos os usuários) e `seed` (usuário demo + 30 lembretes variados, útil para prints do README).

### 7.4 Docker de produção — `build(docker): harden api image`
- [ ] Usuário não-root, `HEALTHCHECK` batendo em `/health`, `pnpm deploy --prod` para reduzir a imagem. Validar `docker compose --profile app up --build`.

### 7.5 Cobertura — `test(api): add coverage threshold`
- [ ] `vitest.config.ts` com `coverage.thresholds` (lines 80) e publicação do `lcov` como artifact no CI.

---

## Fora de escopo (por enquanto)

- Push/e-mail para alertas (só in-app + SSE).
- OAuth social (só email/senha).
- Multi-tenant/organizações.
