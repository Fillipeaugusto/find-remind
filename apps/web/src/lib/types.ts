export type Profile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  timezone: string;
  createdAt: string;
};

export type ReminderKind = "reminder" | "note";
export type ReminderStatus = "scheduled" | "done" | "dismissed" | "snoozed";
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number;
  byWeekday?: number[];
  until?: string | null;
};

export type Reminder = {
  id: string;
  title: string;
  content: string | null;
  kind: ReminderKind;
  remindAt: string | null;
  recurrence: Recurrence | null;
  status: ReminderStatus;
  snoozedUntil: string | null;
  nextFireAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ReminderInput = {
  title: string;
  content?: string | null;
  kind: ReminderKind;
  remindAt?: string | null;
  recurrence?: Recurrence | null;
  tags?: string[];
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type Tag = { name: string; count: number };

export type SearchMode = "keyword" | "semantic" | "hybrid";

export type SearchItem = {
  reminder: Reminder;
  score: number;
  highlights?: string[];
};

export type SearchResponse = {
  items: SearchItem[];
  mode: SearchMode;
  tookMs: number;
  cached: boolean;
};

export type SearchFilters = {
  from?: string;
  to?: string;
  tags?: string[];
  status?: ReminderStatus;
};

export type AskResponse = {
  answer: string;
  filters: SearchFilters;
  items: SearchItem[];
};

export type Alert = {
  id: string;
  reminderId: string;
  reminder: Pick<Reminder, "id" | "title" | "remindAt">;
  firedAt: string;
  readAt: string | null;
};

export type ProviderKind = "ollama" | "openai" | "anthropic" | "google";

export type AiProvider = {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  enabled: boolean;
  defaultChatModel: string | null;
  defaultEmbeddingModel: string | null;
  lastCheckedAt: string | null;
  lastCheckStatus: "ok" | "error" | null;
  lastCheckError: string | null;
  createdAt: string;
};

export type AiProviderInput = {
  kind: ProviderKind;
  label: string;
  baseUrl?: string | null;
  apiKey?: string;
  defaultChatModel?: string | null;
  defaultEmbeddingModel?: string | null;
  enabled?: boolean;
};

export type ProviderModels = {
  chat: { id: string; label: string }[];
  embedding: { id: string; label: string }[];
};

export type AvailableModel = {
  providerId: string;
  providerKind: ProviderKind;
  model: string;
  label: string;
};

export type AvailableModels = {
  chat: AvailableModel[];
  embedding: AvailableModel[];
  defaults: { chat: string | null; embedding: string | null };
};

export type Conversation = {
  id: string;
  title: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
};
