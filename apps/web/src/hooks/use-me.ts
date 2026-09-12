"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import type { Profile } from "@/lib/types";

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Profile>("/me") });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Profile, "name" | "timezone">>) =>
      api<Profile>("/me", { method: "PATCH", body: patch }),
    onSuccess: (profile) => queryClient.setQueryData(keys.me, profile),
  });
}
