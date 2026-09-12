"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellPlusIcon, CalendarDaysIcon, LightbulbIcon, SearchIcon } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useCreateConversation } from "@/hooks/use-conversations";
import { errorMessage } from "@/lib/api";
import { stashPendingMessage } from "@/lib/pending-message";
import { Composer } from "./composer";
import { ModelPicker } from "./model-picker";

const SUGGESTIONS = [
  {
    icon: CalendarDaysIcon,
    title: "Ver minha semana",
    description: "Lista o que está agendado para os próximos dias.",
    prompt: "O que eu tenho agendado para essa semana?",
  },
  {
    icon: BellPlusIcon,
    title: "Criar um lembrete",
    description: "Ligar para o dentista amanhã às 10h.",
    prompt: "Me lembra de ligar para o dentista amanhã às 10h",
  },
  {
    icon: SearchIcon,
    title: "Buscar nas anotações",
    description: "Encontra o que você anotou sobre um assunto.",
    prompt: "Quais anotações eu fiz sobre o projeto?",
  },
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
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-3xl"
      >
        <h1 className="mb-7 text-center text-[28px] font-medium tracking-tight">Como posso ajudar?</h1>

        <Composer
          onSend={start}
          busy={create.isPending}
          placeholder="Pergunte ou peça para criar um lembrete"
          leading={<ModelPicker value={model} onChange={setModel} />}
        />

        <div className="mx-auto mt-6 w-full max-w-[calc(100%-1.5rem)]">
          <p className="mb-3 flex items-center gap-2 text-sm">
            <LightbulbIcon className="size-4 text-amber-500" /> Veja o que o chat pode fazer
          </p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {SUGGESTIONS.map(({ icon: Icon, title, description, prompt }) => (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => start(prompt)}
                  disabled={create.isPending}
                  className="group/card flex h-full w-full flex-col rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-60 dark:border-transparent dark:bg-card dark:hover:bg-muted/70"
                >
                  <span className="mb-4 flex items-start justify-between">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground/80">
                      <Icon className="size-4" />
                    </span>
                    <span className="rounded-full border border-border/80 px-3 py-1 text-xs text-foreground/80 transition-colors group-hover/card:bg-muted">
                      Testar
                    </span>
                  </span>
                  <span className="text-sm font-medium">{title}</span>
                  <span className="mt-1 text-sm leading-5 text-muted-foreground">{description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
