"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

export function Composer({
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = "Pergunte qualquer coisa",
  autoFocus = true,
  leading,
  trailing,
  className,
}: {
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Controles à esquerda da barra inferior (ex.: seletor de modelo). */
  leading?: React.ReactNode;
  /** Controles à direita, antes do botão de enviar. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setText("");
    await onSend(value);
    ref.current?.focus();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onClick={() => ref.current?.focus()}
      className={cn(
        "flex cursor-text flex-col rounded-[28px] border border-border/70 bg-card shadow-xs transition-[border-color,box-shadow]",
        "focus-within:border-border focus-within:shadow-sm dark:border-transparent dark:bg-muted dark:shadow-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Mensagem"
        className="max-h-50 min-h-6 w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80 scrollbar-thin"
      />
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-3" onClick={(e) => e.stopPropagation()}>
        {leading}
        <span className="flex-1" />
        {trailing}
        {busy ? (
          <button
            type="button"
            aria-label="Parar"
            onClick={onStop}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
          >
            <SquareIcon className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!text.trim() || disabled}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 disabled:bg-muted-foreground/30 disabled:text-background/70 dark:disabled:bg-muted-foreground/35 dark:disabled:text-foreground/50"
          >
            <ArrowUpIcon className="size-5" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </form>
  );
}
