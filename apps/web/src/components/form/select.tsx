"use client";

import { useId } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { FieldMessage, fieldLabelBase, fieldLabelFloated, fieldLabelResting, fieldShell } from "./field";

export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean };

export type SelectProps = {
  label: string;
  options: SelectOption[];
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  /** Permite limpar a seleção com uma opção "vazia" no topo. */
  clearLabel?: string;
};

export function Select({
  label,
  options,
  value,
  onValueChange,
  error,
  hint,
  disabled,
  name,
  id,
  className,
  clearLabel,
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const messageId = `${triggerId}-message`;
  const floated = value !== null && value !== undefined && value !== "";
  const items = options.map((option) => ({ value: option.value, label: option.label }));

  return (
    <div className={cn("group/field min-w-0", className)} data-slot="field">
      <SelectPrimitive.Root
        value={value ?? null}
        onValueChange={(next) => onValueChange(next === "" ? null : (next as string | null))}
        items={items}
        disabled={disabled}
        name={name}
      >
        <SelectPrimitive.Trigger
          id={triggerId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            fieldShell,
            "group/trigger cursor-pointer items-center pr-10 pl-3.5 text-left outline-none select-none",
            "focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)] data-popup-open:border-foreground data-popup-open:shadow-[inset_0_0_0_1px_var(--foreground)]",
            "aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--destructive)] aria-invalid:data-popup-open:shadow-[inset_0_0_0_1px_var(--destructive)]",
            "disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-70",
          )}
        >
          <span className={cn(fieldLabelBase, floated ? fieldLabelFloated : fieldLabelResting)}>
            {label}
          </span>
          <SelectPrimitive.Value
            className={cn(
              "block w-full truncate pt-5.5 pb-1.5 text-[15px] leading-6",
              !floated && "text-transparent",
            )}
          />
          <SelectPrimitive.Icon
            render={
              <ChevronDownIcon className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground transition-transform group-data-popup-open/trigger:rotate-180" />
            }
          />
        </SelectPrimitive.Trigger>
        <SelectContent alignItemWithTrigger={false} className="min-w-(--anchor-width) rounded-xl p-1">
          {clearLabel ? (
            <SelectItem value="" className="text-muted-foreground">
              {clearLabel}
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive.Root>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}
