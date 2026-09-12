"use client";

import Link from "next/link";
import { cn } from "cn";
import { AlarmClockIcon, BellIcon, RepeatIcon, StickyNoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/hooks/use-now";
import { STATUS_LABEL, formatDateTime, formatRecurrence, stripMarkdown } from "@/lib/format";
import type { Reminder } from "@/lib/types";
import { ReminderActions } from "./reminder-actions";

export function StatusBadge({ status }: { status: Reminder["status"] }) {
  const tone = {
    scheduled: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    snoozed: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dismissed: "bg-muted text-muted-foreground",
  }[status];
  return (
    <Badge variant="secondary" className={cn("rounded-md border-0 font-medium", tone)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function ReminderMeta({ reminder, className }: { reminder: Reminder; className?: string }) {
  const now = useNow();
  const overdue = reminder.status === "scheduled" && reminder.remindAt && new Date(reminder.remindAt).getTime() < now;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground", className)}>
      {reminder.kind === "reminder" && reminder.remindAt ? (
        <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}>
          <AlarmClockIcon className="size-3.5" />
          {formatDateTime(reminder.remindAt)}
        </span>
      ) : null}
      {reminder.status === "snoozed" && reminder.snoozedUntil ? (
        <span className="inline-flex items-center gap-1">adiado até {formatDateTime(reminder.snoozedUntil)}</span>
      ) : null}
      {reminder.recurrence ? (
        <span className="inline-flex items-center gap-1">
          <RepeatIcon className="size-3.5" />
          {formatRecurrence(reminder.recurrence)}
        </span>
      ) : null}
    </div>
  );
}

export function TagChips({ tags, size = "sm" }: { tags: string[]; size?: "sm" | "md" }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/reminders?tag=${encodeURIComponent(tag)}`}
          className={cn(
            "rounded-md bg-muted text-muted-foreground transition-colors hover:bg-foreground hover:text-background",
            size === "sm" ? "px-1.5 py-0.5 text-[11.5px]" : "px-2 py-1 text-xs",
          )}
        >
          #{tag}
        </Link>
      ))}
    </div>
  );
}

export function ReminderCard({
  reminder,
  onEdit,
  showStatus = true,
}: {
  reminder: Reminder;
  onEdit: (reminder: Reminder) => void;
  showStatus?: boolean;
}) {
  const Icon = reminder.kind === "reminder" ? BellIcon : StickyNoteIcon;
  const done = reminder.status === "done" || reminder.status === "dismissed";

  return (
    <article
      className={cn(
        "group flex gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-border",
        done && "opacity-70",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
          reminder.kind === "reminder" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/reminders/${reminder.id}`}
              className={cn("block truncate text-[15px] font-medium leading-6", done && "line-through decoration-muted-foreground/60")}
            >
              {reminder.title}
            </Link>
            <ReminderMeta reminder={reminder} className="mt-0.5" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showStatus && reminder.kind === "reminder" ? <StatusBadge status={reminder.status} /> : null}
            <ReminderActions reminder={reminder} onEdit={() => onEdit(reminder)} compact />
          </div>
        </div>
        {reminder.content ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{stripMarkdown(reminder.content)}</p>
        ) : null}
        {reminder.tags.length ? (
          <div className="mt-2.5">
            <TagChips tags={reminder.tags} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
