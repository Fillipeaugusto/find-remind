"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AskResponse, SearchMode, SearchResponse } from "@/lib/types";

export type SearchParams = {
  q: string;
  mode: SearchMode;
  tags?: string[];
  from?: string;
  to?: string;
};

export function useSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: ["search", params],
    queryFn: ({ signal }) =>
      api<SearchResponse>("/search", {
        query: { q: params!.q, mode: params!.mode, tags: params!.tags, from: params!.from, to: params!.to, limit: 20 },
        signal,
      }),
    enabled: Boolean(params?.q.trim()),
    retry: false,
    staleTime: 60_000,
  });
}

export function useAsk() {
  return useMutation({
    mutationFn: (question: string) => api<AskResponse>("/search/ask", { method: "POST", body: { question } }),
  });
}
