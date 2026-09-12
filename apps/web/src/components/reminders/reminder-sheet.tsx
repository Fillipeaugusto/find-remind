"use client";

import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCreateReminder, useUpdateReminder } from "@/hooks/use-reminders";
import { errorMessage } from "@/lib/api";
import type { Reminder, ReminderInput } from "@/lib/types";
import { ReminderForm } from "./reminder-form";

export function ReminderSheet({
  open,
  onOpenChange,
  reminder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, o sheet edita este lembrete; caso contrário cria um novo. */
  reminder?: Reminder | null;
  onSaved?: (reminder: Reminder) => void;
}) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const editing = Boolean(reminder);
  const pending = create.isPending || update.isPending;

  const submit = async (input: ReminderInput) => {
    try {
      const saved = reminder
        ? await update.mutateAsync({ id: reminder.id, patch: input })
        : await create.mutateAsync(input);
      toast.success(editing ? "Lembrete atualizado" : "Lembrete criado");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 px-6 py-5">
          <SheetTitle className="text-lg">{editing ? "Editar lembrete" : "Novo lembrete"}</SheetTitle>
          <SheetDescription>
            {editing ? "Ajuste o que precisar e salve." : "Um lembrete dispara um alerta; uma anotação só guarda."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-6 py-5">
          <ReminderForm
            reminder={reminder}
            onSubmit={submit}
            submitting={pending}
            submitLabel={editing ? "Salvar alterações" : "Criar lembrete"}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
