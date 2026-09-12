"use client";

import { useState } from "react";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviders } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/api";
import type { AiProvider } from "@/lib/types";
import { DefaultsForm } from "./defaults-form";
import { ProviderCard } from "./provider-card";
import { ProviderDialog } from "./provider-dialog";

export function AiSettingsView() {
  const providers = useProviders();
  const [dialog, setDialog] = useState<{ open: boolean; provider: AiProvider | null }>({ open: false, provider: null });

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Provedores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ollama local, OpenAI, Anthropic ou Google. Um provedor ativo e com conexão testada libera seus modelos.
            </p>
          </div>
          <Button onClick={() => setDialog({ open: true, provider: null })}>
            <PlusIcon /> Adicionar provedor
          </Button>
        </div>

        <div className="mt-5">
          {providers.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-36 rounded-2xl" />
              <Skeleton className="h-36 rounded-2xl" />
            </div>
          ) : providers.isError ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>Não foi possível carregar</EmptyTitle>
                <EmptyDescription>{errorMessage(providers.error)}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : providers.data.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>Nenhum provedor configurado</EmptyTitle>
                <EmptyDescription>
                  Comece pelo Ollama se quiser rodar tudo localmente, ou adicione uma chave de API.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => setDialog({ open: true, provider: null })}>
                <PlusIcon /> Adicionar provedor
              </Button>
            </Empty>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {providers.data.map((provider) => (
                  <motion.li
                    key={provider.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    <ProviderCard provider={provider} onEdit={() => setDialog({ open: true, provider })} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">Modelos padrão</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Só aparecem modelos de provedores ativos e com a conexão testada com sucesso.
        </p>
        <DefaultsForm />
      </section>

      <ProviderDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        provider={dialog.provider}
      />
    </div>
  );
}
