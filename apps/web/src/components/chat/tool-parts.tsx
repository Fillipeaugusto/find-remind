"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  AlarmClockIcon,
  BellIcon,
  CalendarRangeIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  StickyNoteIcon,
  TagIcon,
  Undo2Icon,
  WrenchIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/reminders/reminder-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeleteReminder } from "@/hooks/use-reminders";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, stripMarkdown } from "@/lib/format";
import type { Reminder, Tag } from "@/lib/types";
import { useQuickReply } from "./quick-reply";

export type ToolPartLike = {
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type ToolMeta = {
  label: string;
  running: string;
  failed: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TOOL_META: Record<string, ToolMeta> = {
  searchReminders: { label: "Buscar lembretes", running: "Buscando lembretes…", failed: "A busca falhou", icon: SearchIcon },
  getReminder: { label: "Abrir lembrete", running: "Abrindo lembrete…", failed: "Não foi possível abrir o lembrete", icon: BellIcon },
  createReminder: { label: "Criar lembrete", running: "Criando lembrete…", failed: "Não foi possível criar o lembrete", icon: PlusIcon },
  updateReminder: { label: "Atualizar lembrete", running: "Atualizando lembrete…", failed: "Não foi possível atualizar o lembrete", icon: PencilIcon },
  completeReminder: { label: "Concluir lembrete", running: "Concluindo lembrete…", failed: "Não foi possível concluir o lembrete", icon: CheckIcon },
  resolveDateRange: { label: "Interpretar período", running: "Interpretando período…", failed: "Não entendi o período", icon: CalendarRangeIcon },
  listTags: { label: "Listar tags", running: "Listando tags…", failed: "Não foi possível listar as tags", icon: TagIcon },
  askUser: { label: "Pergunta", running: "Preparando pergunta…", failed: "Não foi possível perguntar", icon: MessageCircleQuestionIcon },
};

export function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { label: name, running: `Executando ${name}…`, failed: `${name} falhou`, icon: WrenchIcon };
}

// Mensagens que o backend devolve em `errorText`, traduzidas para o usuário.
const ERROR_TEXTS: Record<string, string> = {
  "The assistant sent invalid data to the tool": "a IA enviou dados inválidos",
  "Unable to generate a response": "falha inesperada",
  "Reminder not found": "lembrete não encontrado",
  "The response timed out": "tempo esgotado",
};

export function describeToolError(errorText: string | undefined): string {
  if (!errorText) return "falha inesperada";
  return ERROR_TEXTS[errorText] ?? errorText;
}

type AskUserOption = { label: string; description?: string | null };

export type AskUserInput = {
  question?: string;
  options?: (string | AskUserOption)[] | null;
  allowFreeText?: boolean | null;
};

/** Os modelos mandam as opções ora como texto, ora como objeto. */
export function askUserOptions(input: AskUserInput | undefined): AskUserOption[] {
  return (input?.options ?? [])
    .map((option) => (typeof option === "string" ? { label: option } : option))
    .filter((option): option is AskUserOption => Boolean(option && typeof option.label === "string" && option.label.trim()));
}

/** Mostra o que a IA resolveu de uma etapa interna (ex.: período interpretado). */
export function describeStep(name: string, input: unknown, output: unknown): string {
  if (name === "resolveDateRange") {
    const expression = (input as { expression?: string } | undefined)?.expression;
    const range = output as { from?: string; to?: string; label?: string } | undefined;
    const resolved = range?.label ?? (range?.from && range?.to ? `${formatDate(range.from)} → ${formatDate(range.to)}` : "—");
    return expression ? `“${expression}” → ${resolved}` : resolved;
  }
  return toolMeta(name).label;
}

function isReminder(value: unknown): value is Reminder {
  return Boolean(value) && typeof value === "object" && "id" in (value as object) && "title" in (value as object);
}

/** Aceita `Reminder[]`, `{ items: Reminder[] }` ou `{ items: { reminder }[] }`. */
export function extractReminders(output: unknown): Reminder[] {
  const list = Array.isArray(output)
    ? output
    : output && typeof output === "object" && Array.isArray((output as { items?: unknown }).items)
      ? (output as { items: unknown[] }).items
      : [];
  return list
    .map((item) => (isReminder(item) ? item : (item as { reminder?: unknown })?.reminder))
    .filter(isReminder);
}

export function extractTags(output: unknown): Tag[] {
  const list = Array.isArray(output)
    ? output
    : output && typeof output === "object" && Array.isArray((output as { items?: unknown }).items)
      ? (output as { items: unknown[] }).items
      : [];
  return list
    .map((item) =>
      typeof item === "string"
        ? { name: item, count: 0 }
        : item && typeof item === "object" && "name" in item
          ? { name: String((item as Tag).name), count: Number((item as Tag).count ?? 0) }
          : null,
    )
    .filter((t): t is Tag => Boolean(t));
}

function ToolShell({
  name,
  state,
  children,
}: {
  name: string;
  state: string;
  children?: React.ReactNode;
}) {
  const meta = toolMeta(name);
  const Icon = meta.icon;
  const running = state === "input-streaming" || state === "input-available";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 overflow-hidden rounded-xl border border-border/70 bg-card text-sm"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        {running ? <Spinner className="size-3.5" /> : <Icon className="size-3.5" />}
        <span>{running ? meta.running : meta.label}</span>
      </div>
      {children ? <div className="p-3">{children}</div> : null}
    </motion.div>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  return (
    <TableRow>
      <TableCell className="max-w-64">
        <Link href={`/reminders/${reminder.id}`} className="font-medium hover:underline">
          {reminder.title}
        </Link>
        {reminder.tags.length ? (
          <span className="ml-2 text-xs text-muted-foreground">{reminder.tags.map((t) => `#${t}`).join(" ")}</span>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {reminder.remindAt ? formatDateTime(reminder.remindAt) : "—"}
      </TableCell>
      <TableCell>{reminder.kind === "reminder" ? <StatusBadge status={reminder.status} /> : <span className="text-xs text-muted-foreground">anotação</span>}</TableCell>
    </TableRow>
  );
}

export function ReminderMiniCard({ reminder, actions }: { reminder: Reminder; actions?: React.ReactNode }) {
  const Icon = reminder.kind === "reminder" ? BellIcon : StickyNoteIcon;
  return (
    <div className="flex gap-3 rounded-xl border border-border/70 bg-background p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/reminders/${reminder.id}`} className="truncate font-medium hover:underline">
            {reminder.title}
          </Link>
          {reminder.kind === "reminder" ? <StatusBadge status={reminder.status} /> : null}
        </div>
        {reminder.remindAt ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <AlarmClockIcon className="size-3" /> {formatDateTime(reminder.remindAt)}
          </p>
        ) : null}
        {reminder.content ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{stripMarkdown(reminder.content)}</p> : null}
        {actions ? <div className="mt-2.5 flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
    </div>
  );
}

function CreatedReminderCard({ reminder }: { reminder: Reminder }) {
  const remove = useDeleteReminder();
  const [undone, setUndone] = useState(false);

  const undo = async () => {
    try {
      await remove.mutateAsync(reminder.id);
      setUndone(true);
      toast.success("Lembrete desfeito");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (undone) {
    return <p className="text-xs text-muted-foreground line-through">{reminder.title}</p>;
  }

  return (
    <ReminderMiniCard
      reminder={reminder}
      actions={
        <>
          <Button size="xs" variant="outline" nativeButton={false} render={<Link href={`/reminders/${reminder.id}`} />}>
            <ExternalLinkIcon /> Abrir
          </Button>
          <Button size="xs" variant="ghost" onClick={undo} disabled={remove.isPending}>
            {remove.isPending ? <Spinner /> : <Undo2Icon />} Desfazer
          </Button>
        </>
      }
    />
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Ocultar detalhes" : "Ver detalhes"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[12px] leading-5">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function normalize(text: string) {
  return text.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Pergunta da IA com respostas rápidas. Enquanto a pergunta está aberta, cada
 * opção vira um botão que envia a resposta como mensagem; depois de
 * respondida, a opção escolhida fica marcada. Sem opções, o usuário digita.
 */
function AskUserCard({ input }: { input: AskUserInput | undefined }) {
  const reply = useQuickReply();
  const question = input?.question?.trim();
  const options = askUserOptions(input);
  const rich = options.some((option) => option.description?.trim());
  const active = Boolean(reply?.active);
  const answered = reply?.answered !== undefined ? normalize(reply.answered) : null;
  const freeText = options.length === 0 || Boolean(input?.allowFreeText);

  if (!question) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 rounded-xl border border-border/70 bg-card p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{question}</span>
      </p>

      {options.length ? (
        <ul className={cn("mt-3 gap-2", rich ? "grid sm:grid-cols-2" : "flex flex-wrap")}>
          {options.map((option) => {
            const chosen = answered !== null && normalize(option.label) === answered;
            return (
              <li key={option.label}>
                <button
                  type="button"
                  disabled={!active}
                  aria-pressed={chosen}
                  onClick={() => reply?.onAnswer(option.label)}
                  className={cn(
                    "w-full rounded-lg border text-left transition-colors disabled:cursor-default",
                    rich ? "px-3 py-2.5" : "px-3 py-1.5",
                    chosen
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/80 bg-background text-foreground hover:enabled:border-foreground/40 hover:enabled:bg-muted/60",
                    !active && !chosen && answered !== null && "opacity-50",
                  )}
                >
                  <span className="block font-medium">{option.label}</span>
                  {option.description?.trim() ? (
                    <span className={cn("mt-0.5 block text-xs", chosen ? "text-background/80" : "text-muted-foreground")}>
                      {option.description}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {active && freeText ? (
        <button
          type="button"
          onClick={() => reply?.focusComposer()}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <PencilLineIcon className="size-3.5" />
          {options.length ? "Ou digite outra resposta abaixo" : "Digite sua resposta abaixo"}
        </button>
      ) : null}

      {!active && answered !== null && options.every((option) => normalize(option.label) !== answered) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Resposta: <span className="text-foreground">{reply?.answered}</span>
        </p>
      ) : null}
    </motion.div>
  );
}

/** Falha de ferramenta que ficou sem nova tentativa: linha discreta com o motivo. */
function ToolFailure({ name, errorText }: { name: string; errorText?: string }) {
  const meta = toolMeta(name);
  return (
    <p className="my-2 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
      <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" />
      <span>
        {meta.failed} <span className="opacity-70">· {describeToolError(errorText)}</span>
      </span>
    </p>
  );
}

export function ToolPart({ name, part }: { name: string; part: ToolPartLike }) {
  const { state, output, errorText, input } = part;

  if (name === "askUser") {
    return state === "output-error" ? <ToolFailure name={name} errorText={errorText} /> : <AskUserCard input={input as AskUserInput | undefined} />;
  }

  if (state === "output-error") {
    return <ToolFailure name={name} errorText={errorText} />;
  }

  if (state !== "output-available") {
    return <ToolShell name={name} state={state} />;
  }

  switch (name) {
    case "searchReminders": {
      const reminders = extractReminders(output);
      return (
        <ToolShell name={name} state={state}>
          {reminders.length === 0 ? (
            <p className="text-muted-foreground">Nenhum lembrete encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lembrete</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((r) => (
                    <ReminderRow key={r.id} reminder={r} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ToolShell>
      );
    }
    case "createReminder": {
      return (
        <ToolShell name={name} state={state}>
          {isReminder(output) ? <CreatedReminderCard reminder={output} /> : <JsonBlock value={output} />}
        </ToolShell>
      );
    }
    case "getReminder":
    case "updateReminder":
    case "completeReminder": {
      return (
        <ToolShell name={name} state={state}>
          {isReminder(output) ? (
            <ReminderMiniCard
              reminder={output}
              actions={
                <Button size="xs" variant="outline" nativeButton={false} render={<Link href={`/reminders/${output.id}`} />}>
                  <ExternalLinkIcon /> Abrir
                </Button>
              }
            />
          ) : (
            <JsonBlock value={output} />
          )}
        </ToolShell>
      );
    }
    case "resolveDateRange": {
      // Normalmente vai para a sanfona de raciocínio; aqui só se sobrar visível.
      return (
        <ToolShell name={name} state={state}>
          <p className="text-muted-foreground">{describeStep(name, input, output)}</p>
        </ToolShell>
      );
    }
    case "listTags": {
      const tags = extractTags(output);
      return (
        <ToolShell name={name} state={state}>
          {tags.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma tag ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Link
                  key={tag.name}
                  href={`/reminders?tag=${encodeURIComponent(tag.name)}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs transition-colors hover:bg-foreground hover:text-background"
                >
                  #{tag.name}
                  {tag.count ? <span className="opacity-60 tabular-nums">{tag.count}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </ToolShell>
      );
    }
    default:
      return (
        <ToolShell name={name} state={state}>
          <JsonBlock value={output} />
        </ToolShell>
      );
  }
}
