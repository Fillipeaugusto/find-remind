"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, BellIcon, PencilIcon, StickyNoteIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useReminder } from "@/hooks/use-reminders";
import { errorMessage, isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ReminderActions } from "./reminder-actions";
import { ReminderMeta, StatusBadge, TagChips } from "./reminder-card";
import { ReminderSheet } from "./reminder-sheet";

export function ReminderDetail({ id }: { id: string }) {
  const router = useRouter();
  const query = useReminder(id);
  const [editing, setEditing] = useState(false);

  if (query.isPending) {
    return (
      <PageContainer className="max-w-3xl">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-6 h-9 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/3" />
        <Skeleton className="mt-8 h-40 rounded-2xl" />
      </PageContainer>
    );
  }

  if (query.isError) {
    const notFound = isApiError(query.error, 404);
    return (
      <PageContainer className="max-w-3xl">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{notFound ? "Lembrete não encontrado" : "Não foi possível carregar"}</EmptyTitle>
            <EmptyDescription>
              {notFound ? "Ele pode ter sido excluído." : errorMessage(query.error)}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" nativeButton={false} render={<Link href="/reminders" />}>
            <ArrowLeftIcon /> Voltar
          </Button>
        </Empty>
      </PageContainer>
    );
  }

  const reminder = query.data;
  const Icon = reminder.kind === "reminder" ? BellIcon : StickyNoteIcon;

  return (
    <PageContainer className="max-w-3xl">
      <Link
        href="/reminders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Lembretes
      </Link>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background">
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{reminder.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {reminder.kind === "reminder" ? <StatusBadge status={reminder.status} /> : null}
              <ReminderMeta reminder={reminder} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon /> Editar
          </Button>
          <ReminderActions reminder={reminder} onEdit={() => setEditing(true)} onDeleted={() => router.replace("/reminders")} />
        </div>
      </div>

      {reminder.tags.length ? (
        <div className="mt-4">
          <TagChips tags={reminder.tags} size="md" />
        </div>
      ) : null}

      <section className="mt-8 rounded-2xl border border-border/70 bg-card p-6">
        {reminder.content ? (
          <Markdown>{reminder.content}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">Sem conteúdo. Clique em editar para adicionar uma descrição.</p>
        )}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        Criado {formatDateTime(reminder.createdAt)} · atualizado {formatDateTime(reminder.updatedAt)}
      </p>

      <ReminderSheet open={editing} onOpenChange={setEditing} reminder={reminder} />
    </PageContainer>
  );
}
