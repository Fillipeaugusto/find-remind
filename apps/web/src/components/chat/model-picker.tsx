"use client";

import Link from "next/link";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { modelKey } from "@/components/ai/defaults-form";
import { PROVIDER_KINDS } from "@/components/ai/provider-kinds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableModels } from "@/hooks/use-ai";

const pill =
  "inline-flex h-8 max-w-64 items-center gap-1.5 rounded-full px-2.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted";

/** Seletor compacto de modelo, usado na barra inferior do composer. */
export function ModelPicker({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const { data, isPending } = useAvailableModels();
  const chat = data?.chat ?? [];

  if (isPending) return <Skeleton className="h-8 w-36 rounded-full" />;

  if (chat.length === 0) {
    return (
      <Link
        href="/settings/ai"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-500/10 px-3 text-sm text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-400"
      >
        <SparklesIcon className="size-4" /> Configurar um modelo
      </Link>
    );
  }

  const selectedKey = value ?? data?.defaults.chat ?? modelKey(chat[0]);
  const selected = chat.find((m) => modelKey(m) === selectedKey) ?? chat[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={pill} aria-label="Modelo">
        <SparklesIcon className="size-4 shrink-0" />
        <span className="truncate">{selected.label}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuRadioGroup value={selectedKey} onValueChange={(next) => onChange(next as string)}>
          <DropdownMenuLabel>Modelo</DropdownMenuLabel>
          {chat.map((m) => (
            <DropdownMenuRadioItem key={modelKey(m)} value={modelKey(m)}>
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              <span className="text-xs text-muted-foreground">{PROVIDER_KINDS[m.providerKind].label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Modelo fixo de uma conversa já criada — só informativo. */
export function ModelLabel({ model }: { model: string }) {
  const label = model.split(":").slice(1).join(":") || model;
  return (
    <span className="inline-flex h-8 max-w-64 items-center gap-1.5 px-2.5 text-sm text-muted-foreground" title="Modelo">
      <SparklesIcon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
