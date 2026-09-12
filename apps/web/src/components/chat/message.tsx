"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { cn } from "cn";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import { Markdown } from "@/components/markdown";
import { ToolPart } from "./tool-parts";

function Reasoning({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim() && !streaming) return null;
  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {streaming ? "Pensando…" : "Raciocínio"}
      </button>
      {open ? <p className="mt-1.5 border-l-2 border-border pl-3 text-sm text-muted-foreground">{text}</p> : null}
    </div>
  );
}

export function ChatMessage({ message, streaming }: { message: UIMessage; streaming?: boolean }) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-background sm:max-w-[75%]">
          {text}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
      <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-card">
        <SparklesIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return <Markdown key={index}>{part.text}</Markdown>;
          }
          if (part.type === "reasoning") {
            return <Reasoning key={index} text={part.text} streaming={part.state === "streaming"} />;
          }
          if (isToolUIPart(part)) {
            return <ToolPart key={part.toolCallId} name={getToolName(part)} part={part} />;
          }
          return null;
        })}
        {streaming && message.parts.every((p) => p.type !== "text") ? (
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
        ) : null}
      </div>
    </motion.div>
  );
}
