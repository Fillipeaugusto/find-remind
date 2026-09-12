"use client";

import { useId } from "react";
import { cn } from "cn";
import {
  FieldMessage,
  fieldControl,
  fieldLabelBase,
  fieldLabelFloated,
  fieldLabelPeer,
  fieldShell,
} from "./field";

export type InputProps = Omit<React.ComponentProps<"input">, "placeholder"> & {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  /** Conteúdo à direita, dentro da caixa (ícone, botão). */
  trailing?: React.ReactNode;
  /** Mantém o label sempre encolhido — para tipos nativos que já exibem valor (date, time). */
  alwaysFloat?: boolean;
  containerClassName?: string;
};

export function Input({
  label,
  error,
  hint,
  trailing,
  alwaysFloat,
  className,
  containerClassName,
  id,
  type = "text",
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const float = alwaysFloat || type === "date" || type === "datetime-local" || type === "time";

  return (
    <div className={cn("group/field min-w-0", containerClassName)} data-slot="field">
      <div className={fieldShell}>
        <input
          id={inputId}
          type={type}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(fieldControl, "dark:[color-scheme:dark]", trailing && "pr-11", className)}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(fieldLabelBase, float ? fieldLabelFloated : fieldLabelPeer)}
        >
          {label}
        </label>
        {trailing ? (
          <div className="absolute inset-y-0 right-3 flex items-center text-muted-foreground">
            {trailing}
          </div>
        ) : null}
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
