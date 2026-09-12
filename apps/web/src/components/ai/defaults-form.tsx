"use client";

import { toast } from "sonner";
import { Select } from "@/components/form/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableModels, useSetDefaults } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/api";
import type { AvailableModel } from "@/lib/types";
import { PROVIDER_KINDS } from "./provider-kinds";

export function modelKey(model: AvailableModel) {
  return `${model.providerId}:${model.model}`;
}

function toOptions(models: AvailableModel[]) {
  return models.map((m) => ({
    value: modelKey(m),
    label: (
      <span className="flex items-center gap-2">
        <span className="truncate">{m.label}</span>
        <span className="text-xs text-muted-foreground">{PROVIDER_KINDS[m.providerKind].label}</span>
      </span>
    ),
  }));
}

export function DefaultsForm() {
  const { data, isPending, isError, error } = useAvailableModels();
  const setDefaults = useSetDefaults();

  if (isError) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Não foi possível carregar os modelos: {errorMessage(error)}
      </p>
    );
  }

  if (isPending || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-13 rounded-xl" />
        <Skeleton className="h-13 rounded-xl" />
      </div>
    );
  }

  const save = async (patch: { chat?: string; embedding?: string }) => {
    try {
      await setDefaults.mutateAsync(patch);
      toast.success("Padrão atualizado");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const none = data.chat.length === 0 && data.embedding.length === 0;

  return (
    <div className="space-y-3">
      {none ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum modelo disponível ainda. Adicione um provedor, teste a conexão e mantenha-o ativo para que os modelos
          apareçam aqui.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Modelo de chat padrão"
          options={toOptions(data.chat)}
          value={data.defaults.chat}
          onValueChange={(value) => value && save({ chat: value })}
          disabled={data.chat.length === 0 || setDefaults.isPending}
          hint="Usado no chat e na busca em linguagem natural."
        />
        <Select
          label="Modelo de embeddings padrão"
          options={toOptions(data.embedding)}
          value={data.defaults.embedding}
          onValueChange={(value) => value && save({ embedding: value })}
          disabled={data.embedding.length === 0 || setDefaults.isPending}
          hint="Usado na busca semântica. Trocar reprocessa os lembretes."
        />
      </div>
    </div>
  );
}
