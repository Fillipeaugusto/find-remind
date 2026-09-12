"use client";

import Link from "next/link";
import { cn } from "cn";
import { BellIcon, StickyNoteIcon } from "lucide-react";
import { motion } from "motion/react";
import { ReminderMeta, StatusBadge, TagChips } from "@/components/reminders/reminder-card";
import { stripMarkdown } from "@/lib/format";
import { renderHighlight } from "@/lib/highlight";
import type { SearchItem } from "@/lib/types";

export function SearchResult({ item, index }: { item: SearchItem; index: number }) {
  const { reminder, highlights, score } = item;
  const Icon = reminder.kind === "reminder" ? BellIcon : StickyNoteIcon;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.3) }}
    >
      <article className="group flex gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-border">
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
              <h3 className="truncate text-[15px] font-medium leading-6">
                <Link href={`/reminders/${reminder.id}`} className="hover:underline underline-offset-4">
                  {reminder.title}
                </Link>
              </h3>
              <ReminderMeta reminder={reminder} className="mt-0.5" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {reminder.kind === "reminder" ? <StatusBadge status={reminder.status} /> : null}
              <span className="font-mono text-[11px] text-muted-foreground/70 tabular-nums" title="Relevância">
                {score.toFixed(2)}
              </span>
            </div>
          </div>
          {highlights?.length ? (
            <p className="prose-chat mt-1.5 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {highlights.slice(0, 2).map((h, i) => (
                <span key={i}>
                  {i > 0 ? " … " : null}
                  {renderHighlight(h)}
                </span>
              ))}
            </p>
          ) : reminder.content ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{stripMarkdown(reminder.content)}</p>
          ) : null}
          {reminder.tags.length ? (
            <div className="mt-2.5">
              <TagChips tags={reminder.tags} />
            </div>
          ) : null}
        </div>
      </article>
    </motion.li>
  );
}
