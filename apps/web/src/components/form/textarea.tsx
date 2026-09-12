"use client";

import { useId } from "react";
import { cn } from "cn";
import { FieldMessage, fieldControl, fieldLabelBase, fieldShell } from "./field";

export type TextareaProps = Omit<React.ComponentProps<"textarea">, "placeholder"> & {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  containerClassName?: string;
};

const labelPeer =
  "top-4 text-[15px] " +
  "peer-focus:top-2 peer-focus:text-[11.5px] peer-focus:font-medium peer-focus:tracking-wide " +
  "peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11.5px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:tracking-wide";

export function Textarea({
  label,
  error,
  hint,
  className,
  containerClassName,
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div className={cn("group/field min-w-0", containerClassName)} data-slot="field">
      <div className={fieldShell}>
        <textarea
          id={inputId}
          rows={rows}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(fieldControl, "resize-y scrollbar-thin", className)}
          {...props}
        />
        <label htmlFor={inputId} className={cn(fieldLabelBase, labelPeer)}>
          {label}
        </label>
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
