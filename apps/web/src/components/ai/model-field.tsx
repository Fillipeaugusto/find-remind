"use client";

import { useState } from "react";
import { Input } from "@/components/form/input";
import { Select } from "@/components/form/select";

/**
 * Campo de modelo: vira um select quando o provedor expõe a lista de modelos,
 * mas sempre permite digitar um id manualmente.
 */
export function ModelField({
  label,
  value,
  onChange,
  models,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  models?: { id: string; label: string }[];
  error?: string;
  hint?: React.ReactNode;
}) {
  const [manual, setManual] = useState(false);
  const hasList = Boolean(models?.length);
  const useSelect = hasList && !manual;

  const options = (models ?? []).map((m) => ({ value: m.id, label: m.label }));
  if (useSelect && value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: value });
  }

  const toggle = (
    <button
      type="button"
      className="underline underline-offset-4 hover:text-foreground"
      onClick={() => setManual((m) => !m)}
    >
      {useSelect ? "Digitar manualmente" : hasList ? "Escolher da lista" : null}
    </button>
  );

  return useSelect ? (
    <Select
      label={label}
      options={options}
      value={value || null}
      onValueChange={(v) => onChange(v ?? "")}
      clearLabel="Nenhum"
      error={error}
      hint={
        <>
          {hint} {toggle}
        </>
      }
    />
  ) : (
    <Input
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={
        <>
          {hint} {hasList ? toggle : null}
        </>
      }
    />
  );
}
