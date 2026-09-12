"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import type { Conversation, Page } from "@/lib/types";

export function useConversations() {
  return useInfiniteQuery({
    queryKey: keys.conversations,
    queryFn: ({ pageParam }) =>
      api<Page<Conversation>>("/chat/conversations", { query: { limit: 30, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: keys.conversation(id),
    queryFn: () => api<{ conversation: Conversation; messages: UIMessage[] }>(`/chat/conversations/${id}`),
    staleTime: Infinity,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (model?: string) =>
      api<Conversation>("/chat/conversations", { method: "POST", body: model ? { model } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.conversations }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/chat/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.conversation(id) });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}
