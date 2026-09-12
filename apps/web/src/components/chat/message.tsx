"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { cn } from "cn";
import { ChevronRightIcon, CircleAlertIcon, CornerDownRightIcon, SparklesIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Markdown } from "@/components/markdown";
import { groupMessageParts, userMessageText, type ProcessEntry } from "./message-parts";
import { QuickReplyContext, type QuickReply } from "./quick-reply";
import { describeStep, describeToolError, ToolPart, toolMeta } from "./tool-parts";

function ProcessEntryView({ entry }: { entry: ProcessEntry }) {
  if (entry.kind === "reasoning") {
    return <p className="whitespace-pre-wrap">{entry.text}</p>;
  }
  if (entry.kind === "attempt") {
    return (
      <p className="inline-flex items-start gap-1.5">
        <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive/80" />
        <span>
          {toolMeta(entry.name).label}: {describeToolError(entry.errorText)}
        </span>
      </p>
    );
  }
  return (
    <p className="inline-flex items-start gap-1.5">
      <CornerDownRightIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{describeStep(entry.name, entry.input, entry.output)}</span>
    </p>
  );
}

/**
 * Raciocínio, etapas internas e tentativas refeitas ficam numa sanfona
 * fechada; enquanto o modelo pensa, o rótulo vira "Pensando…".
 */
function Process({ entries, thinking }: { entries: ProcessEntry[]; thinking: boolean }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0 && !thinking) return null;

  const attempts = entries.filter((entry) => entry.kind === "attempt").length;
  const hasReasoning = entries.some((entry) => entry.kind === "reasoning");
  const label = thinking ? "Pensando…" : hasReasoning ? "Raciocínio" : "Etapas";

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <span className={cn(thinking && "animate-pulse")}>{label}</span>
        {attempts > 0 && !thinking ? (
          <span className="opacity-70">
            · {attempts} {attempts === 1 ? "tentativa falhou" : "tentativas falharam"}
          </span>
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 flex flex-col gap-2 border-l-2 border-border pl-3 text-[13px] leading-5 text-muted-foreground">
              {entries.map((entry, index) => (
                <ProcessEntryView key={index} entry={entry} />
              ))}
              {thinking && entries.length === 0 ? <p className="italic">Aguardando o modelo…</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Digitando">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

export function ChatMessage({
  message,
  streaming,
  quickReply,
}: {
  message: UIMessage;
  streaming?: boolean;
  /** Presente só nas mensagens do assistente; define se perguntas podem ser respondidas. */
  quickReply?: QuickReply;
}) {
  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-background sm:max-w-[75%]">
          {userMessageText(message)}
        </div>
      </motion.div>
    );
  }

  const { process, thinking, body } = groupMessageParts(message.parts, streaming);

  return (
    <QuickReplyContext.Provider value={quickReply ?? null}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
        <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-card">
          <SparklesIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <Process entries={process} thinking={thinking} />
          {body.map((item, index) =>
            item.kind === "text" ? (
              <Markdown key={index}>{item.text}</Markdown>
            ) : (
              <ToolPart key={item.part.toolCallId} name={item.name} part={item.part} />
            ),
          )}
          {streaming && !thinking && body.length === 0 ? <TypingDots /> : null}
        </div>
      </motion.div>
    </QuickReplyContext.Provider>
  );
}
