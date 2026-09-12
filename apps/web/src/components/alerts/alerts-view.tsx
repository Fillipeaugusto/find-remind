"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { BellRingIcon, CheckCheckIcon, CheckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAlerts, useMarkAlertRead, useMarkAllAlertsRead } from "@/hooks/use-alerts";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";

export function AlertsView() {
  const [onlyUnread, setOnlyUnread] = useState(true);
  const query = useAlerts(onlyUnread);
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = items.filter((a) => !a.readAt).length;

  const readAll = async () => {
    try {
      await markAll.mutateAsync();
      toast.success("Todos os alertas marcados como lidos");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Alertas"
        description="Lembretes que já dispararam."
        actions={
          <Button variant="outline" onClick={readAll} disabled={markAll.isPending || unread === 0}>
            {markAll.isPending ? <Spinner /> : <CheckCheckIcon />}
            Marcar todos como lidos
          </Button>
        }
      />

      <div className="mt-6 flex gap-1 rounded-xl bg-muted p-1 w-fit">
        {[
          { value: true, label: "Não lidos" },
          { value: false, label: "Todos" },
        ].map((tab) => {
          const active = tab.value === onlyUnread;
          return (
            <button
              key={String(tab.value)}
              role="tab"
              aria-selected={active}
              onClick={() => setOnlyUnread(tab.value)}
              className={cn(
                "relative h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="alerts-tab"
                  className="absolute inset-0 rounded-lg bg-background shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Não foi possível carregar</EmptyTitle>
              <EmptyDescription>{errorMessage(query.error)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : items.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRingIcon />
              </EmptyMedia>
              <EmptyTitle>{onlyUnread ? "Tudo em dia" : "Nenhum alerta ainda"}</EmptyTitle>
              <EmptyDescription>
                {onlyUnread ? "Nenhum alerta pendente. Eles aparecem aqui assim que disparam." : "Os alertas dos seus lembretes aparecerão aqui."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
            <AnimatePresence initial={false}>
              {items.map((alert) => {
                const isRead = Boolean(alert.readAt);
                return (
                  <motion.li
                    key={alert.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className={cn("size-2 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-foreground")}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/reminders/${alert.reminderId}`}
                        className={cn("block truncate text-[15px] leading-6", isRead ? "text-muted-foreground" : "font-medium")}
                      >
                        {alert.reminder.title}
                      </Link>
                      <p className="text-xs text-muted-foreground" title={formatDateTime(alert.firedAt)}>
                        disparado {formatRelative(alert.firedAt)}
                        {alert.reminder.remindAt ? ` · marcado para ${formatDateTime(alert.reminder.remindAt)}` : ""}
                      </p>
                    </div>
                    {!isRead ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Marcar como lido"
                        onClick={() => markRead.mutate(alert.id)}
                        disabled={markRead.isPending}
                      >
                        <CheckIcon />
                      </Button>
                    ) : null}
                  </motion.li>
                );
              })}
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
    </PageContainer>
  );
}
