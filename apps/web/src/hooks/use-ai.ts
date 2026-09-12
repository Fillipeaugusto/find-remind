"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import type { AiProvider, AiProviderInput, AvailableModels, ProviderModels } from "@/lib/types";

export function useProviders() {
  return useQuery({
    queryKey: keys.providers,
    queryFn: () => api<{ items: AiProvider[] }>("/ai/providers").then((r) => r.items),
  });
}

export function useProviderModels(id: string | null) {
  return useQuery({
    queryKey: keys.providerModels(id ?? ""),
    queryFn: () => api<ProviderModels>(`/ai/providers/${id}/models`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAvailableModels() {
  return useQuery({ queryKey: keys.models, queryFn: () => api<AvailableModels>("/ai/models") });
}

function useInvalidateAi() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["ai"] });
}

export function useCreateProvider() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (input: AiProviderInput) => api<AiProvider>("/ai/providers", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateProvider() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AiProviderInput> }) =>
      api<AiProvider>(`/ai/providers/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useDeleteProvider() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/ai/providers/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useTestProvider() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (id: string) => api<AiProvider>(`/ai/providers/${id}/test`, { method: "POST" }),
    onSettled: invalidate,
  });
}

export function useSetDefaults() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (defaults: { chat?: string; embedding?: string }) =>
      api<void>("/ai/defaults", { method: "PUT", body: defaults }),
    onSuccess: invalidate,
  });
}
