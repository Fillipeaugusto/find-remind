"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { FieldMessage, fieldLabelBase, fieldLabelFloated, fieldLabelResting, fieldShell } from "./field";

export type TagsInputProps = {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  id?: string;
};

export function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
}

export function TagsInput({ label, value, onChange, suggestions = [], error, hint, className, id }: TagsInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0 || draft.length > 0;

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (draft.trim()) {
        event.preventDefault();
        add(draft);
        setDraft("");
      }
    } else if (event.key === "Backspace" && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const available = suggestions.filter((s) => !value.includes(s)).slice(0, 8);

  return (
    <div className={cn("group/field min-w-0", className)} data-slot="field">
      <label
        htmlFor={inputId}
        className={cn(fieldShell, "cursor-text flex-wrap items-end gap-1.5 px-3.5 pt-5.5 pb-1.5")}
      >
        <span className={cn(fieldLabelBase, floated ? fieldLabelFloated : fieldLabelResting)}>{label}</span>
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-[13px] leading-none text-foreground"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remover ${tag}`}
              onClick={() => remove(tag)}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
          aria-invalid={error ? true : undefined}
          className="h-6 min-w-24 flex-1 bg-transparent text-[15px] leading-6 outline-none"
        />
      </label>
      {available.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              + {tag}
            </button>
          ))}
        </div>
      ) : null}
      <FieldMessage error={error} hint={hint} />
    </div>
  );
}
