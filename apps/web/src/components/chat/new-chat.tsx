"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useCreateConversation } from "@/hooks/use-conversations";
import { errorMessage } from "@/lib/api";
import { stashPendingMessage } from "@/lib/pending-message";
import { Composer } from "./composer";
import { ModelPicker } from "./model-picker";

const SUGGESTIONS = [
  "O que eu tenho agendado para essa semana?",
  "Me lembra de ligar para o dentista amanhã às 10h",
  "Quais anotações eu fiz sobre o projeto?",
  "Liste minhas tags mais usadas",
];

export function NewChat() {
  const router = useRouter();
  const create = useCreateConversation();
  const [model, setModel] = useState<string | null>(null);

  const start = async (text: string) => {
    try {
      const conversation = await create.mutateAsync(model ?? undefined);
      stashPendingMessage(conversation.id, text);
      router.push(`/chat/${conversation.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-2xl"
      >
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-border/70 bg-card">
            <SparklesIcon className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Como posso ajudar?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pergunte sobre seus lembretes, peça para criar um ou procure algo que você anotou.
          </p>
        </div>

        <Composer onSend={start} busy={create.isPending} placeholder="Pergunte ou peça para criar um lembrete…" />

        <div className="mt-4">
          <ModelPicker value={model} onChange={setModel} />
        </div>

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => start(suggestion)}
                disabled={create.isPending}
                className="w-full rounded-xl border border-border/70 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
