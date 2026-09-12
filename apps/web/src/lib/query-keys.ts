export const keys = {
  me: ["me"] as const,
  reminders: (filters?: Record<string, unknown>) => ["reminders", filters ?? {}] as const,
  reminder: (id: string) => ["reminders", "detail", id] as const,
  tags: ["tags"] as const,
  alerts: (unread?: boolean) => ["alerts", { unread: unread ?? false }] as const,
  providers: ["ai", "providers"] as const,
  providerModels: (id: string) => ["ai", "providers", id, "models"] as const,
  models: ["ai", "models"] as const,
  conversations: ["chat", "conversations"] as const,
  conversation: (id: string) => ["chat", "conversations", id] as const,
};
