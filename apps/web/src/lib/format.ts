import {
  format,
  formatDistanceToNowStrict,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Recurrence, ReminderStatus } from "./types";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatDateTime(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "";
  const date = parseISO(iso);
  const time = format(date, "HH:mm");
  if (isToday(date)) return `hoje, ${time}`;
  if (isTomorrow(date)) return `amanhã, ${time}`;
  if (isYesterday(date)) return `ontem, ${time}`;
  const pattern = isSameYear(date, now) ? "EEE, d MMM, HH:mm" : "d MMM yyyy, HH:mm";
  return format(date, pattern, { locale: ptBR });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "";
  return formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true });
}

export function formatRecurrence(recurrence: Recurrence | null | undefined) {
  if (!recurrence) return "";
  const { freq, interval, byWeekday } = recurrence;
  const every = interval > 1 ? `a cada ${interval} ` : "";
  switch (freq) {
    case "daily":
      return interval > 1 ? `${every}dias` : "todo dia";
    case "weekly": {
      const days = byWeekday?.length ? ` (${byWeekday.map((d) => WEEKDAYS[d]).join(", ")})` : "";
      return (interval > 1 ? `${every}semanas` : "toda semana") + days;
    }
    case "monthly":
      return interval > 1 ? `${every}meses` : "todo mês";
    case "yearly":
      return interval > 1 ? `${every}anos` : "todo ano";
  }
}

export const STATUS_LABEL: Record<ReminderStatus, string> = {
  scheduled: "Agendado",
  done: "Concluído",
  dismissed: "Dispensado",
  snoozed: "Adiado",
};

/** Converte o valor de um `<input type="datetime-local">` (hora local) para ISO UTC. */
export function localToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converte ISO UTC para o formato aceito por `<input type="datetime-local">`. */
export function isoToLocal(iso: string | null | undefined) {
  if (!iso) return "";
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Remove a sintaxe Markdown mais comum para exibir uma prévia em texto puro. */
export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
