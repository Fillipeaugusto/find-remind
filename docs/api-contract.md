# Contrato da API

Base URL: `http://localhost:3001`. Todas as rotas (exceto `/health` e `/api/auth/*`) exigem sessão válida (cookie do Better Auth) e respondem `401` sem ela. Respostas de erro seguem o formato do `@fastify/sensible`: `{ statusCode, error, message }`.

Datas sempre em ISO 8601 UTC. O fuso do usuário fica em `user.timezone` e é usado para interpretar linguagem natural ("segunda passada").

Paginação por cursor: `?limit=20&cursor=<opaque>` → `{ items: [...], nextCursor: string | null }`.

## Auth — `/api/auth/*` (Better Auth)

Rotas geradas pelo Better Auth (email/senha). O frontend usa o client oficial (`better-auth/react`).

- `POST /api/auth/sign-up/email` `{ name, email, password }`
- `POST /api/auth/sign-in/email` `{ email, password }`
- `POST /api/auth/sign-out`
- `GET /api/auth/get-session`

## Perfil — `/me`

- `GET /me` → `{ id, name, email, image, timezone, createdAt }`
- `PATCH /me` `{ name?, timezone? }` → mesmo objeto

## Lembretes — `/reminders`

```ts
type Reminder = {
  id: string
  title: string
  content: string | null          // markdown
  kind: "reminder" | "note"       // note = sem alerta
  remindAt: string | null         // ISO; obrigatório quando kind = reminder
  recurrence: null | {
    freq: "daily" | "weekly" | "monthly" | "yearly"
    interval: number              // a cada N
    byWeekday?: number[]          // 0-6, para weekly
    until?: string | null
  }
  status: "scheduled" | "done" | "dismissed" | "snoozed"
  snoozedUntil: string | null
  nextFireAt: string | null       // próxima vez que o alerta dispara; null para notas e itens concluídos/dispensados
  tags: string[]
  createdAt: string
  updatedAt: string
}
```

- `GET /reminders?status=&tag=&from=&to=&limit=&cursor=` → paginado, ordenado por `remindAt asc` (nulls por último) e `createdAt desc`; `from`/`to` filtram por `remindAt`
- `POST /reminders` `{ title, content?, kind, remindAt?, recurrence?, tags? }` → `201 Reminder`. `kind = reminder` exige `remindAt` (pode estar no passado: o alerta dispara na hora); `recurrence` só em `kind = reminder`; tags são normalizadas (lowercase, trim, sem duplicatas).
- `GET /reminders/:id` → `Reminder` (`404` para id inexistente ou de outro usuário)
- `PATCH /reminders/:id` (parcial) → `Reminder`. Mudar `kind`, `remindAt` ou `recurrence` reagenda o lembrete (`status = scheduled`, `snoozedUntil = null`). `tags` substitui a lista inteira.
- `DELETE /reminders/:id` → `204` (soft delete)
- `POST /reminders/:id/done` → `Reminder`. Lembrete recorrente: mantém `status = scheduled` e avança `nextFireAt` para a próxima ocorrência após agora (no fuso do usuário); sem próxima ocorrência (`until`) vira `done`.
- `POST /reminders/:id/snooze` `{ until }` → `Reminder` (`status = snoozed`, `nextFireAt = until`). `until` no passado → `400`; nota → `409`.
- `POST /reminders/:id/dismiss` → `Reminder` (`status = dismissed`, não dispara mais).
- `GET /tags` → `{ items: { name: string, count: number }[] }`

## Busca — `/search`

- `GET /search?q=&mode=keyword|semantic|hybrid&from=&to=&tags=&status=&limit=` →
  ```ts
  { items: { reminder: Reminder, score: number, highlights?: string[] }[], mode, tookMs, cached: boolean }
  ```
  `mode` padrão: `hybrid`. `semantic`/`hybrid` exigem um provider de IA configurado com modelo de embeddings; caso contrário `409 { code: "NO_EMBEDDING_PROVIDER" }`.

  `q` é obrigatório (1–1000 caracteres após trim); `limit` começa em 20 e aceita 1–100. Datas ISO são inclusivas e filtram o campo `remindAt`, não `nextFireAt` ou o horário de adiamento. `from > to` → `400`. Tags aceitam parâmetros repetidos ou separados por vírgula; são normalizadas e todas devem corresponder. `status` usa os mesmos valores dos lembretes.

  `keyword` usa relevância textual com peso 3 no título e trechos destacados com `<em>` (texto escapado para HTML). `semantic` usa similaridade de cosseno entre vetores da mesma referência de modelo e dimensão. `hybrid` combina até 500 candidatos de cada busca por Reciprocal Rank Fusion (`k = 60`). Os scores pertencem ao modo escolhido e não são comparáveis entre modos.

  Resultados ficam em cache por usuário, filtros e modelo durante 60s (`cached: true` em hit). Gravações e conclusão da indexação invalidam o cache; indexação e geração de embeddings são assíncronas. A resposta sempre relê os lembretes do Postgres, verificando usuário, exclusão e filtros. Falha no provedor de embeddings ou no Elasticsearch → `502` com mensagem sanitizada.
- `POST /search/ask` `{ question }` → busca em linguagem natural. O backend extrai filtros (intervalo de datas no fuso do usuário, tags, status) com o LLM, roda a busca híbrida e devolve:
  ```ts
  { answer: string, filters: { from?, to?, tags?, status? }, items: SearchItem[] }
  ```

  `question` aceita 1–2000 caracteres após trim. Exige modelos padrão de chat e embedding (`409` com `NO_CHAT_PROVIDER` ou `NO_EMBEDDING_PROVIDER`). A busca usa até 20 resultados e a resposta em Markdown cita lembretes por links `/reminders/:id`. Sem resultados, retorna `items: []` e uma mensagem explícita, sem chamar o modelo de resumo. Falha na extração, filtros inválidos produzidos pelo modelo ou falha no resumo → `502`, sem detalhes sensíveis.

  Expressões relativas são resolvidas pelo backend no fuso cadastrado, com início/fim inclusivos em UTC: hoje, ontem, anteontem, amanhã, depois de amanhã; semana atual/passada/próxima; mês atual/passado/próximo; ano atual/passado/próximo; dias da semana passados/próximos; `dia N`. Semanas vão de segunda a domingo. Dias da semana passados/próximos nunca significam hoje. `dia N` usa o mês atual, mesmo se o dia já passou; dia inexistente ou expressão não reconhecida → `400`. Limites respeitam horário de verão. Quando houver `dateExpression`, seus limites substituem `from`/`to` sugeridos pelo modelo; sem expressão relativa, datas explícitas são validadas e usadas diretamente.

## Alertas — `/alerts`

```ts
type Alert = {
  id: string
  reminderId: string
  reminder: Pick<Reminder, "id" | "title" | "remindAt">
  firedAt: string                 // instante da ocorrência (o nextFireAt que disparou)
  readAt: string | null
}
```

O scheduler roda a cada 30s: ao disparar, um lembrete recorrente avança `nextFireAt` para a próxima ocorrência; os demais ficam `status = scheduled` com `nextFireAt = null` até o usuário concluir, adiar ou dispensar. Um lembrete atrasado gera um único alerta por varredura (ocorrências perdidas não acumulam). Há no máximo um alerta por `(reminderId, firedAt)`.

- `GET /alerts?unread=true&limit=&cursor=` → paginado, ordenado por `firedAt desc`; `unread` aceita `true`/`false` (padrão `false` = todos). Alertas de lembretes apagados não aparecem.
- `POST /alerts/:id/read` → `Alert` (idempotente: mantém o primeiro `readAt`; `404` para id de outro usuário)
- `POST /alerts/read-all` → `204`
- `GET /alerts/stream` → **SSE** (`text/event-stream`). Abre com o comentário `: connected`; eventos: `alert` (`data` = `Alert`) e `ping` (`data` = `{ at }`) a cada 25s. A conexão é encerrada pelo servidor apenas no shutdown — o `EventSource` reconecta sozinho.

## Provedores de IA — `/ai/providers`

```ts
type ProviderKind = "ollama" | "openai" | "anthropic" | "google"

type AiProvider = {
  id: string
  kind: ProviderKind
  label: string
  baseUrl: string | null          // ollama e endpoints compatíveis
  hasApiKey: boolean              // nunca devolver a chave
  enabled: boolean
  defaultChatModel: string | null
  defaultEmbeddingModel: string | null
  lastCheckedAt: string | null
  lastCheckStatus: "ok" | "error" | null
  lastCheckError: string | null
  createdAt: string
}
```

- `GET /ai/providers` → `{ items: AiProvider[] }`
- `POST /ai/providers` `{ kind, label, baseUrl?, apiKey?, enabled?, defaultChatModel?, defaultEmbeddingModel? }` → `201 AiProvider`. `enabled` começa como `true`; `baseUrl` e modelos aceitam `null`. Chaves são criptografadas e nunca retornam nas respostas.
- `PATCH /ai/providers/:id` (parcial; `apiKey` só sobrescreve se enviado) → `AiProvider`
- `DELETE /ai/providers/:id` → `204`, removendo também os padrões que apontam para ele.
- `POST /ai/providers/:id/test` → testa conexão, atualiza `lastCheck*` → `200 AiProvider`, inclusive em falha (`lastCheckStatus = error`, mensagem sem detalhes sensíveis). Testa o chat configurado com uma resposta mínima e o embedding configurado com `ping`. Sem modelos configurados, escolhe o primeiro chat do catálogo; com apenas embedding, testa apenas embedding. Uma edição concorrente impede que o resultado valide credenciais antigas.
- `GET /ai/providers/:id/models` → `{ chat: { id: string, label: string }[], embedding: { id: string, label: string }[] }` (Ollama: `/api/tags` e `/api/show` para capacidades; demais: lista curada + modelos configurados + o que a API do provider expõe). Falha no catálogo do Ollama → `502`; provedores de nuvem usam o catálogo local se a listagem remota falhar.
- `GET /ai/models` → modelos **disponíveis para uso** = união dos providers `enabled` com `lastCheckStatus = ok`:
  ```ts
  { chat: { providerId, providerKind, model, label }[], embedding: {...}[], defaults: { chat: string | null, embedding: string | null } }
  ```
- `PUT /ai/defaults` `{ chat?: "providerId:model", embedding?: "providerId:model" }` → `204`

Alterar o padrão de embedding agenda a reconstrução dos vetores dos lembretes do usuário em segundo plano. Criações e edições também geram embeddings pela fila; modelos diferentes são mantidos separados pela referência completa do provedor e do modelo.

Todas as operações ficam restritas ao usuário autenticado; ids de outros usuários nas rotas `/ai/providers/:id*` retornam `404`. `baseUrl` exige HTTP(S), sem credenciais, query ou fragmento. URL, chave ou modelo inválido → `400`; Anthropic não aceita modelo de embedding. `apiKey` deve ser não vazia quando enviada; omiti-la no PATCH preserva a chave salva.

Alterar tipo, URL, chave ou modelos zera `lastCheck*` e remove os padrões associados. Desabilitar o provedor ou falhar no teste também remove esses padrões. Alterar apenas o rótulo preserva a validação. Conflitos entre alterações simultâneas retornam `409`.

Os padrões de chat e embedding são atualizados juntos, preservando campos omitidos (`{}` não altera nada). Provedor ausente, desabilitado, não testado ou sem a capacidade solicitada → `409 { statusCode, error, message, code: "NO_CHAT_PROVIDER" | "NO_EMBEDDING_PROVIDER" }`; modelo fora do catálogo → `400`. O nome após o primeiro `:` pode conter outros `:`, como `llama3.2:latest`. `GET /ai/models` omite provedores cujo catálogo não pôde ser consultado e devolve `null` para padrões ausentes da lista disponível.

## Chat — `/chat`

```ts
type Conversation = { id: string, title: string | null, model: string, createdAt: string, updatedAt: string }
```

- `GET /chat/conversations?limit=&cursor=` → paginado, ordenado por `updatedAt desc` (a conversa com mensagem mais recente primeiro)
- `POST /chat/conversations` `{ model?: "providerId:model" }` → `201 Conversation`. O corpo pode ser omitido. Sem `model`, usa o chat padrão do usuário; o modelo fica fixo na conversa. Referência mal formada → `400`; provedor ausente, desabilitado, não testado ou de outro usuário → `409 { code: "NO_CHAT_PROVIDER" }`.
- `GET /chat/conversations/:id` → `{ conversation, messages: UIMessage[] }` (formato `UIMessage` do AI SDK, na ordem da conversa; `404` para id inexistente ou de outro usuário)
- `DELETE /chat/conversations/:id` → `204` (apaga as mensagens junto)
- `POST /chat/conversations/:id/messages` `{ messages: UIMessage[] }` → **stream** no protocolo UI Message Stream do AI SDK (compatível com `useChat` do `@ai-sdk/react`). Persiste a mensagem do usuário e a resposta completa ao terminar.

  Só a última mensagem do corpo é usada: deve ser `role: "user"` com ao menos um part `text` (até 20.000 caracteres no total, sem arquivos); as anteriores são ignoradas porque o histórico vem do servidor. Mensagem inválida → `400`; conversa inexistente ou de outro usuário → `404`; modelo da conversa indisponível → `409 { code: "NO_CHAT_PROVIDER" }`. A resposta é `200 text/event-stream` com o header `x-vercel-ai-ui-message-stream: v1`; o id da mensagem do assistente vem no evento `start`. O modelo executa até 5 passos de tools por turno; uma chamada a `askUser` encerra o turno na hora. Falhas do provedor (chave inválida, modelo inexistente, limite de requisições) ou de uma tool chegam como eventos `error` / `tool-output-error` com mensagem legível, sem detalhes sensíveis (input inválido enviado pelo modelo vira `tool-input-error` + `tool-output-error` com "The assistant sent invalid data to the tool"; o modelo recebe os detalhes e costuma tentar de novo), e a pergunta fica salva para reenvio. Caracteres U+FFFD (tokens quebrados do modelo) são removidos de `text`/`reasoning` antes de persistir. Reenviar uma mensagem com o mesmo `id` substitui o turno em vez de duplicá-lo. O título da conversa é gerado na primeira resposta.

Ferramentas (tools) disponíveis para o modelo no chat — o frontend renderiza os `tool-*` parts como UI:

| tool | input | output (renderização) |
|---|---|---|
| `searchReminders` | `{ query, from?, to?, tags?, status? }` | lista de lembretes → **tabela/cards** |
| `getReminder` | `{ id }` | `Reminder` → **card** |
| `createReminder` | `{ title, content?, remindAt?, recurrence?, tags? }` | `Reminder` criado → **card com botões** (abrir, desfazer) |
| `updateReminder` | `{ id, patch }` | `Reminder` |
| `completeReminder` | `{ id }` | `Reminder` |
| `resolveDateRange` | `{ expression }` ("segunda passada", "semana que vem") | `{ from, to, label }` |
| `listTags` | `{}` | tags com contagem → **chips** |
| `askUser` | `{ question, options?: (string \| { label, description? })[] (até 6), allowFreeText? }` | `{ awaitingUser: true }` → **pergunta com respostas rápidas**; a resposta escolhida é enviada como mensagem de texto do usuário |

Campos opcionais dos inputs aceitam `null` além de omissão (os modelos costumam mandar `null`).

## Health

- `GET /health` → `{ status: "ok", uptime, timestamp }`
- `GET /health/ready` → `{ status: "ok" | "degraded", checks: { postgres, redis, elasticsearch } }` — cada check é `"ok" | "error"`; responde `503` quando `status = degraded`
