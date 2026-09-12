"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { Input } from "@/components/form/input";
import { Select } from "@/components/form/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useCreateProvider, useProviderModels, useUpdateProvider } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/api";
import type { AiProvider, AiProviderInput, ProviderKind } from "@/lib/types";
import { ModelField } from "./model-field";
import { PROVIDER_KINDS, PROVIDER_KIND_OPTIONS } from "./provider-kinds";

const schema = z
  .object({
    kind: z.enum(["ollama", "openai", "anthropic", "google"]),
    label: z.string().trim().min(1, "Dê um nome ao provedor").max(60),
    baseUrl: z.string().trim(),
    apiKey: z.string(),
    defaultChatModel: z.string().trim(),
    defaultEmbeddingModel: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.baseUrl && !/^https?:\/\//.test(values.baseUrl)) {
      ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "Use uma URL começando com http:// ou https://" });
    }
  });

type Values = z.infer<typeof schema>;

function toValues(provider?: AiProvider | null, kind: ProviderKind = "ollama"): Values {
  return {
    kind: provider?.kind ?? kind,
    label: provider?.label ?? PROVIDER_KINDS[provider?.kind ?? kind].label,
    baseUrl: provider?.baseUrl ?? PROVIDER_KINDS[provider?.kind ?? kind].defaultBaseUrl ?? "",
    apiKey: "",
    defaultChatModel: provider?.defaultChatModel ?? "",
    defaultEmbeddingModel: provider?.defaultEmbeddingModel ?? "",
  };
}

export function ProviderDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: AiProvider | null;
}) {
  const editing = Boolean(provider);
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const models = useProviderModels(provider?.id ?? null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(provider) });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "kind" });
  const meta = PROVIDER_KINDS[kind];
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) form.reset(toValues(provider));
  }, [open, provider, form]);

  const onKindChange = (next: ProviderKind) => {
    const previous = form.getValues();
    form.setValue("kind", next);
    if (!previous.label || previous.label === PROVIDER_KINDS[previous.kind].label) {
      form.setValue("label", PROVIDER_KINDS[next].label);
    }
    form.setValue("baseUrl", PROVIDER_KINDS[next].defaultBaseUrl ?? "");
  };

  const submit = form.handleSubmit(async (values) => {
    if (!editing && meta.needsApiKey && !values.apiKey.trim()) {
      form.setError("apiKey", { message: "Informe a chave de API" });
      return;
    }
    const patch: Omit<AiProviderInput, "kind"> = {
      label: values.label,
      baseUrl: meta.supportsBaseUrl && values.baseUrl ? values.baseUrl : null,
      defaultChatModel: values.defaultChatModel || null,
      defaultEmbeddingModel: values.defaultEmbeddingModel || null,
      ...(values.apiKey.trim() ? { apiKey: values.apiKey.trim() } : {}),
    };
    try {
      if (provider) {
        await update.mutateAsync({ id: provider.id, patch });
        toast.success("Provedor atualizado");
      } else {
        await create.mutateAsync({ kind: values.kind, ...patch });
        toast.success("Provedor adicionado. Teste a conexão para liberar os modelos.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar provedor" : "Adicionar provedor"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "A chave só é substituída se você informar uma nova."
              : "Depois de salvar, teste a conexão para que os modelos apareçam para uso."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-3">
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Select
                label="Tipo"
                options={PROVIDER_KIND_OPTIONS}
                value={field.value}
                onValueChange={(value) => value && onKindChange(value as ProviderKind)}
                disabled={editing}
                hint={meta.description}
              />
            )}
          />
          <Input label="Nome" error={errors.label?.message} {...form.register("label")} />
          {meta.supportsBaseUrl ? (
            <Input
              label={kind === "ollama" ? "URL do Ollama" : "URL base (opcional)"}
              type="url"
              error={errors.baseUrl?.message}
              hint={kind === "openai" ? "Para endpoints compatíveis com a API da OpenAI." : undefined}
              {...form.register("baseUrl")}
            />
          ) : null}
          {meta.needsApiKey ? (
            <PasswordInput
              label={editing && provider?.hasApiKey ? "Nova chave de API (opcional)" : "Chave de API"}
              autoComplete="off"
              error={errors.apiKey?.message}
              hint={meta.apiKeyHint}
              {...form.register("apiKey")}
            />
          ) : null}

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="defaultChatModel"
              render={({ field }) => (
                <ModelField
                  label="Modelo de chat"
                  value={field.value}
                  onChange={field.onChange}
                  models={models.data?.chat}
                  error={errors.defaultChatModel?.message}
                />
              )}
            />
            <Controller
              control={form.control}
              name="defaultEmbeddingModel"
              render={({ field }) => (
                <ModelField
                  label="Modelo de embeddings"
                  value={field.value}
                  onChange={field.onChange}
                  models={models.data?.embedding}
                  error={errors.defaultEmbeddingModel?.message}
                />
              )}
            />
          </div>
          {models.isError ? (
            <p className="text-[13px] text-muted-foreground">
              Não foi possível listar os modelos deste provedor — digite os ids manualmente.
            </p>
          ) : null}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
