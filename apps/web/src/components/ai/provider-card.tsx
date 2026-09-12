"use client";

import { useState } from "react";
import { cn } from "cn";
import { CheckCircle2Icon, CircleDashedIcon, PencilIcon, PlugZapIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteProvider, useTestProvider, useUpdateProvider } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { AiProvider } from "@/lib/types";
import { PROVIDER_KINDS } from "./provider-kinds";

function CheckStatus({ provider }: { provider: AiProvider }) {
  if (provider.lastCheckStatus === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
        <CheckCircle2Icon className="size-3.5" /> Conectado {formatRelative(provider.lastCheckedAt)}
      </span>
    );
  }
  if (provider.lastCheckStatus === "error") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex cursor-help items-center gap-1 text-xs text-destructive" />}
        >
          <XCircleIcon className="size-3.5" /> Falha na conexão {formatRelative(provider.lastCheckedAt)}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{provider.lastCheckError ?? "Erro desconhecido"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleDashedIcon className="size-3.5" /> Ainda não testado
    </span>
  );
}

export function ProviderCard({ provider, onEdit }: { provider: AiProvider; onEdit: () => void }) {
  const meta = PROVIDER_KINDS[provider.kind];
  const test = useTestProvider();
  const update = useUpdateProvider();
  const remove = useDeleteProvider();
  const [confirm, setConfirm] = useState(false);
  const usable = provider.enabled && provider.lastCheckStatus === "ok";

  const runTest = async () => {
    try {
      const result = await test.mutateAsync(provider.id);
      if (result.lastCheckStatus === "ok") toast.success(`${provider.label}: conexão ok`);
      else toast.error(result.lastCheckError ?? "A conexão falhou");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggle = async (enabled: boolean) => {
    try {
      await update.mutateAsync({ id: provider.id, patch: { enabled } });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const confirmRemove = async () => {
    try {
      await remove.mutateAsync(provider.id);
      toast.success("Provedor removido");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 transition-colors",
        !provider.enabled && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold tracking-wide",
            usable ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          {meta.mark}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-medium">{provider.label}</h3>
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {provider.baseUrl ? (
              <span className="truncate font-mono text-[11px] text-muted-foreground/80">{provider.baseUrl}</span>
            ) : null}
          </div>
          <div className="mt-1">
            <CheckStatus provider={provider} />
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Chat</dt>
              <dd className="truncate font-mono text-xs leading-5">{provider.defaultChatModel ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Embeddings</dt>
              <dd className="truncate font-mono text-xs leading-5">{provider.defaultEmbeddingModel ?? "—"}</dd>
            </div>
          </dl>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{provider.enabled ? "Ativo" : "Inativo"}</span>
          <Switch checked={provider.enabled} onCheckedChange={toggle} disabled={update.isPending} aria-label="Ativar provedor" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
        <Button variant="outline" size="sm" onClick={runTest} disabled={test.isPending}>
          {test.isPending ? <Spinner /> : <PlugZapIcon />}
          Testar conexão
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <PencilIcon /> Editar
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm(true)}>
          <Trash2Icon /> Remover
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{provider.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave de API será apagada e os modelos deste provedor deixarão de aparecer para uso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
