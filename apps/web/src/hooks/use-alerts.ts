"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_URL, api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import type { Alert, Page } from "@/lib/types";

export function useAlerts(unread = false) {
  return useInfiniteQuery({
    queryKey: keys.alerts(unread),
    queryFn: ({ pageParam }) =>
      api<Page<Alert>>("/alerts", { query: { unread: unread || undefined, limit: 30, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: [...keys.alerts(true), "count"],
    queryFn: () => api<Page<Alert>>("/alerts", { query: { unread: true, limit: 100 } }).then((p) => p.items.length),
    refetchInterval: 60_000,
  });
}

function useInvalidateAlerts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function useMarkAlertRead() {
  const invalidate = useInvalidateAlerts();
  return useMutation({
    mutationFn: (id: string) => api<Alert>(`/alerts/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useMarkAllAlertsRead() {
  const invalidate = useInvalidateAlerts();
  return useMutation({
    mutationFn: () => api<void>("/alerts/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });
}

/** Assina o stream SSE de alertas: mostra um toast e atualiza as listas ao receber um. */
export function useAlertStream(onAlert?: (alert: Alert) => void) {
  const invalidate = useInvalidateAlerts();
  const router = useRouter();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${API_URL}/alerts/stream`, { withCredentials: true });

    const handle = (event: MessageEvent<string>) => {
      try {
        const alert = JSON.parse(event.data) as Alert;
        toast(alert.reminder.title, {
          description: "Lembrete disparado agora",
          action: { label: "Ver", onClick: () => router.push(`/reminders/${alert.reminderId}`) },
        });
        onAlert?.(alert);
        void invalidate();
      } catch {
        // payload inesperado; ignora
      }
    };

    source.addEventListener("alert", handle);
    return () => {
      source.removeEventListener("alert", handle);
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
