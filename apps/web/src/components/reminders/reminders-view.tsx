"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { BellIcon, PlusIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useReminders, useTags } from "@/hooks/use-reminders";
import { errorMessage } from "@/lib/api";
import type { Reminder, ReminderStatus } from "@/lib/types";
import { ReminderCard } from "./reminder-card";
import { ReminderSheet } from "./reminder-sheet";

type StatusFilter = ReminderStatus | "all";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "scheduled", label: "Agendados" },
  { value: "snoozed", label: "Adiados" },
  { value: "done", label: "Concluídos" },
  { value: "dismissed", label: "Dispensados" },
  { value: "all", label: "Todos" },
];

function isStatus(value: string | null): value is StatusFilter {
  return STATUS_TABS.some((tab) => tab.value === value);
}

export function RemindersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status: StatusFilter = isStatus(params.get("status")) ? (params.get("status") as StatusFilter) : "scheduled";
  const tag = params.get("tag") ?? undefined;

  const setParam = useCallback(
    (key: string, value?: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const query = useReminders({ status, tag });
  const { data: tags = [] } = useTags();
  const [sheet, setSheet] = useState<{ open: boolean; reminder: Reminder | null }>({ open: false, reminder: null });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const topTags = tags.slice(0, 12);

  return (
    <PageContainer>
      <PageHeader
        title="Lembretes"
        description="Tudo que você quer lembrar, num só lugar."
        actions={
          <Button size="lg" className="h-10 px-4" onClick={() => setSheet({ open: true, reminder: null })}>
            <PlusIcon /> Novo lembrete
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={active}
                onClick={() => setParam("status", tab.value === "scheduled" ? undefined : tab.value)}
                className={cn(
                  "relative h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="status-tab"
                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {topTags.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {topTags.map((t) => {
            const active = t.name === tag;
            return (
              <button
                key={t.name}
                onClick={() => setParam("tag", active ? undefined : t.name)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                #{t.name}
                <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>
                  {t.count}
                </span>
                {active ? <XIcon className="size-3" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : query.isError ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Não foi possível carregar</EmptyTitle>
              <EmptyDescription>{errorMessage(query.error)}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </Empty>
        ) : items.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellIcon />
              </EmptyMedia>
              <EmptyTitle>Nada por aqui</EmptyTitle>
              <EmptyDescription>
                {tag
                  ? `Nenhum lembrete com a tag #${tag} neste filtro.`
                  : status === "scheduled"
                    ? "Crie seu primeiro lembrete e receba o alerta na hora certa."
                    : "Nenhum lembrete neste filtro."}
              </EmptyDescription>
            </EmptyHeader>
            {status === "scheduled" && !tag ? (
              <Button onClick={() => setSheet({ open: true, reminder: null })}>
                <PlusIcon /> Novo lembrete
              </Button>
            ) : null}
          </Empty>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((reminder) => (
                <motion.li
                  key={reminder.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  <ReminderCard reminder={reminder} onEdit={(r) => setSheet({ open: true, reminder: r })} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {query.hasNextPage ? (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? <Spinner /> : null}
              Carregar mais
            </Button>
          </div>
        ) : null}
      </div>

      <ReminderSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        reminder={sheet.reminder}
      />
    </PageContainer>
  );
}
