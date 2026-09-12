import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { App } from "../app.js";
import { NoProviderError } from "../ai/errors.js";
import { resolveDateRange } from "../ai/date-range.js";
import {
  recurrenceSchema,
  reminderStatusSchema,
  tagNameSchema,
  updateReminderSchema,
  type Reminder,
} from "../modules/reminders/reminders.schemas.js";
import { createRemindersService, type Actor } from "../modules/reminders/reminders.service.js";
import { createSearchService } from "../modules/search/search.service.js";
import { normalizeTags } from "../modules/reminders/tags.js";

const isoDatetime = z.iso.datetime({ offset: true });

const CHAT_RESULT_LIMIT = 20;
const ASK_USER_MAX_OPTIONS = 6;

// Models often send `null` for fields they decided not to fill; the services
// expect those fields to be absent instead.
function optionals<T extends Record<string, unknown>>(input: T): { [K in keyof T]: Exclude<T[K], null> | undefined } {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value ?? undefined])) as never;
}

// Tools exposed to the chat model. They call the same services as the HTTP
// routes (never the routes themselves), so ownership checks and validation
// stay in one place; the outputs match the contract the frontend renders.
export function createChatTools(app: App, actor: Actor): ToolSet {
  const reminders = createRemindersService(app);
  const search = createSearchService(app);

  return {
    searchReminders: tool({
      description:
        "Busca lembretes e notas do usuário por texto e/ou filtros. Use query vazia para listar apenas por período, tags ou status. Chame resolveDateRange antes quando houver expressão temporal.",
      inputSchema: z.object({
        query: z.string().trim().max(1_000).describe("Termos de busca; vazio para filtrar apenas"),
        from: isoDatetime.nullish().describe("Início do período (remindAt), ISO 8601"),
        to: isoDatetime.nullish().describe("Fim do período (remindAt), ISO 8601"),
        tags: z.array(tagNameSchema).max(20).nullish(),
        status: reminderStatusSchema.nullish(),
      }),
      execute: async (input): Promise<{ items: Reminder[] }> => {
        const { query, from, to, tags, status } = optionals(input);
        if (!query) {
          const page = await reminders.list(actor, { from, to, status, tag: tags?.[0], limit: CHAT_RESULT_LIMIT });
          const wanted = normalizeTags(tags ?? []);
          return { items: page.items.filter((item) => wanted.every((tag) => item.tags.includes(tag))) };
        }
        const filters = { q: query, from, to, tags: normalizeTags(tags ?? []), status, limit: CHAT_RESULT_LIMIT };
        let result;
        try {
          result = await search.search(actor.id, { ...filters, mode: "hybrid" });
        } catch (error) {
          // Semantic search needs an embedding model; keyword search is always available.
          if (!(error instanceof NoProviderError)) throw error;
          result = await search.search(actor.id, { ...filters, mode: "keyword" });
        }
        return { items: result.items.map((item) => item.reminder) };
      },
    }),

    getReminder: tool({
      description: "Lê um lembrete pelo id.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => reminders.get(actor, id),
    }),

    createReminder: tool({
      description:
        "Cria um lembrete (com remindAt) ou uma nota (sem remindAt). recurrence só se aplica a lembretes.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        content: z.string().max(20_000).nullish().describe("Detalhes em Markdown"),
        remindAt: isoDatetime.nullish().describe("Quando alertar, ISO 8601 com offset"),
        recurrence: recurrenceSchema.nullish().describe("Omita (ou null) para um lembrete único"),
        tags: z.array(tagNameSchema).max(20).nullish(),
      }),
      execute: ({ title, content, remindAt, recurrence, tags }) =>
        reminders.create(actor, {
          title,
          content: content ?? null,
          kind: remindAt ? "reminder" : "note",
          remindAt: remindAt ?? null,
          recurrence: recurrence ?? null,
          tags: tags ?? [],
        }),
    }),

    updateReminder: tool({
      description:
        "Altera campos de um lembrete. Mudar kind, remindAt ou recurrence reagenda o lembrete; tags substitui a lista inteira.",
      inputSchema: z.object({ id: z.string(), patch: updateReminderSchema }),
      execute: ({ id, patch }) => reminders.update(actor, id, patch),
    }),

    completeReminder: tool({
      description: "Marca um lembrete como concluído. Lembretes recorrentes avançam para a próxima ocorrência.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => reminders.done(actor, id),
    }),

    resolveDateRange: tool({
      description:
        "Converte uma expressão temporal em português (hoje, ontem, semana passada, segunda que vem, mês passado, dia 15...) em um intervalo ISO no fuso do usuário.",
      inputSchema: z.object({ expression: z.string().trim().min(1).max(200) }),
      execute: ({ expression }) => resolveDateRange(expression, new Date(), actor.timezone),
    }),

    listTags: tool({
      description: "Lista as tags do usuário com a quantidade de lembretes em cada uma.",
      inputSchema: z.object({}),
      execute: () => reminders.listTags(actor),
    }),

    // The turn ends right after this call (see the stream service); the
    // frontend renders the question with the options as quick replies.
    askUser: tool({
      description:
        "Pergunta algo ao usuário quando faltar uma informação para continuar (horário, recorrência, qual lembrete alterar...). Ofereça opções curtas quando as respostas prováveis forem poucas; sem opções, o usuário digita a resposta. Não repita a pergunta em texto: a interface exibe a pergunta e o turno termina até o usuário responder.",
      inputSchema: z.object({
        question: z.string().trim().min(1).max(500),
        options: z
          .array(
            z.union([
              z.string().trim().min(1).max(80),
              z.object({ label: z.string().trim().min(1).max(80), description: z.string().trim().max(160).nullish() }),
            ]),
          )
          .max(ASK_USER_MAX_OPTIONS)
          .nullish()
          .describe("Respostas prováveis para escolher com um clique; texto simples ou { label, description }"),
        allowFreeText: z.boolean().nullish().describe("Se, além das opções, o usuário pode digitar outra resposta"),
      }),
      execute: async () => ({ awaitingUser: true }),
    }),
  };
}
