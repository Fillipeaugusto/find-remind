"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import type { Page, Reminder, ReminderInput, ReminderStatus, Tag } from "@/lib/types";

export type ReminderFilters = {
  status?: ReminderStatus | "all";
  tag?: string;
  from?: string;
  to?: string;
};

const PAGE_SIZE = 20;

export function useReminders(filters: ReminderFilters = {}) {
  const status = filters.status === "all" ? undefined : filters.status;
  return useInfiniteQuery({
    queryKey: keys.reminders({ ...filters, status }),
    queryFn: ({ pageParam }) =>
      api<Page<Reminder>>("/reminders", {
        query: { status, tag: filters.tag, from: filters.from, to: filters.to, limit: PAGE_SIZE, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useReminder(id: string, initialData?: Reminder) {
  return useQuery({
    queryKey: keys.reminder(id),
    queryFn: () => api<Reminder>(`/reminders/${id}`),
    initialData,
  });
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api<{ items: Tag[] }>("/tags").then((r) => r.items),
  });
}

function useInvalidateReminders() {
  const queryClient = useQueryClient();
  return (reminder?: Reminder) => {
    if (reminder) queryClient.setQueryData(keys.reminder(reminder.id), reminder);
    void queryClient.invalidateQueries({ queryKey: ["reminders"] });
    void queryClient.invalidateQueries({ queryKey: keys.tags });
  };
}

export function useCreateReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (input: ReminderInput) => api<Reminder>("/reminders", { method: "POST", body: input }),
    onSuccess: (reminder) => invalidate(reminder),
  });
}

export function useUpdateReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReminderInput> }) =>
      api<Reminder>(`/reminders/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (reminder) => invalidate(reminder),
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/reminders/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.reminder(id) });
      invalidate();
    },
  });
}

type Action = "done" | "dismiss" | "snooze";

export function useReminderAction() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ id, action, until }: { id: string; action: Action; until?: string }) =>
      api<Reminder>(`/reminders/${id}/${action}`, {
        method: "POST",
        body: action === "snooze" ? { until } : undefined,
      }),
    onSuccess: (reminder) => invalidate(reminder),
  });
}
