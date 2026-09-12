"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlarmClockIcon,
  BellOffIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteReminder, useReminderAction } from "@/hooks/use-reminders";
import { errorMessage } from "@/lib/api";
import type { Reminder } from "@/lib/types";

export function snoozeOptions(now = new Date()) {
  const at = (fn: (d: Date) => void) => {
    const d = new Date(now);
    fn(d);
    return d.toISOString();
  };
  const tomorrow9 = at((d) => {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  });
  const nextMonday9 = at((d) => {
    const delta = ((8 - d.getDay()) % 7) || 7;
    d.setDate(d.getDate() + delta);
    d.setHours(9, 0, 0, 0);
  });
  return [
    { label: "10 minutos", until: at((d) => d.setMinutes(d.getMinutes() + 10)) },
    { label: "1 hora", until: at((d) => d.setHours(d.getHours() + 1)) },
    { label: "3 horas", until: at((d) => d.setHours(d.getHours() + 3)) },
    { label: "Amanhã às 9h", until: tomorrow9 },
    { label: "Segunda às 9h", until: nextMonday9 },
  ];
}

export function ReminderActions({
  reminder,
  onEdit,
  onDeleted,
  compact = false,
}: {
  reminder: Reminder;
  onEdit: () => void;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const action = useReminderAction();
  const remove = useDeleteReminder();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOpen = reminder.status === "scheduled" || reminder.status === "snoozed";
  const isReminder = reminder.kind === "reminder";

  const run = async (kind: "done" | "dismiss" | "snooze", until?: string, message?: string) => {
    try {
      await action.mutateAsync({ id: reminder.id, action: kind, until });
      if (message) toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const confirmRemove = async () => {
    try {
      await remove.mutateAsync(reminder.id);
      toast.success("Lembrete excluído");
      onDeleted?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {isReminder && isOpen ? (
          <Button
            variant="outline"
            size={compact ? "icon-sm" : "sm"}
            aria-label="Concluir"
            onClick={() => run("done", undefined, "Concluído")}
            disabled={action.isPending}
          >
            <CheckIcon />
            {compact ? null : "Concluir"}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size={compact ? "icon-sm" : "icon"} aria-label="Mais ações" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon /> Editar
            </DropdownMenuItem>
            {isReminder && isOpen ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AlarmClockIcon /> Adiar
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {snoozeOptions().map((option) => (
                      <DropdownMenuItem
                        key={option.label}
                        onClick={() => run("snooze", option.until, `Adiado: ${option.label.toLowerCase()}`)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => run("dismiss", undefined, "Dispensado")}>
                  <BellOffIcon /> Dispensar
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{reminder.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
