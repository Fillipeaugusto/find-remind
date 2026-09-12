"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Composer({
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = "Pergunte ou peça para criar um lembrete…",
  autoFocus = true,
  className,
}: {
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
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
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-input bg-background p-2 pl-4 shadow-sm transition-[border-color,box-shadow]",
        "focus-within:border-foreground focus-within:shadow-[inset_0_0_0_1px_var(--foreground)]",
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
        className="max-h-50 min-h-6 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 scrollbar-thin"
      />
      {busy ? (
        <Button type="button" size="icon" variant="outline" aria-label="Parar" onClick={onStop}>
          <SquareIcon className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" aria-label="Enviar" disabled={!text.trim() || disabled}>
          <ArrowUpIcon />
        </Button>
      )}
    </form>
  );
}
