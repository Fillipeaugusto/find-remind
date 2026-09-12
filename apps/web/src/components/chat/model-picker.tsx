"use client";

import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Select } from "@/components/form/select";
import { Button } from "@/components/ui/button";
import { useAvailableModels } from "@/hooks/use-ai";
import { modelKey } from "@/components/ai/defaults-form";
import { PROVIDER_KINDS } from "@/components/ai/provider-kinds";

export function ModelPicker({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const { data, isPending } = useAvailableModels();
  const chat = data?.chat ?? [];

  if (!isPending && chat.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <p className="text-muted-foreground">Nenhum modelo de chat disponível. Configure um provedor de IA para começar.</p>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/settings/ai" />}>
          <SparklesIcon /> Configurar IA
        </Button>
      </div>
    );
  }

  const options = chat.map((m) => ({
    value: modelKey(m),
    label: (
      <span className="flex items-center gap-2">
        <span className="truncate">{m.label}</span>
        <span className="text-xs text-muted-foreground">{PROVIDER_KINDS[m.providerKind].label}</span>
      </span>
    ),
  }));

  return (
    <Select
      label="Modelo"
      options={options}
      value={value ?? data?.defaults.chat ?? null}
      onValueChange={onChange}
      disabled={isPending}
      hint={value ? undefined : "Usando o modelo padrão das configurações."}
    />
  );
}
