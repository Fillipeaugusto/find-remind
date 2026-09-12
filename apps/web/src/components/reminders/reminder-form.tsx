"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { cn } from "cn";
import { BellIcon, StickyNoteIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Input } from "@/components/form/input";
import { Select } from "@/components/form/select";
import { TagsInput } from "@/components/form/tags-input";
import { Textarea } from "@/components/form/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTags } from "@/hooks/use-reminders";
import { isoToLocal, localToIso } from "@/lib/format";
import type { Recurrence, Reminder, ReminderInput } from "@/lib/types";

const schema = z
  .object({
    title: z.string().trim().min(1, "Dê um título ao lembrete").max(200, "Título muito longo"),
    kind: z.enum(["reminder", "note"]),
    remindAt: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    freq: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
    interval: z.number("Informe um número").int("Use um número inteiro").min(1, "Mínimo 1").max(365, "Máximo 365"),
    byWeekday: z.array(z.number()),
    until: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.kind === "reminder" && !values.remindAt) {
      ctx.addIssue({ code: "custom", path: ["remindAt"], message: "Informe quando lembrar" });
    }
    if (values.freq === "weekly" && values.byWeekday.length === 0) {
      ctx.addIssue({ code: "custom", path: ["byWeekday"], message: "Escolha pelo menos um dia" });
    }
  });

export type ReminderFormValues = z.infer<typeof schema>;

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const FREQ_OPTIONS = [
  { value: "none", label: "Não repete" },
  { value: "daily", label: "Diariamente" },
  { value: "weekly", label: "Semanalmente" },
  { value: "monthly", label: "Mensalmente" },
  { value: "yearly", label: "Anualmente" },
];

function defaultRemindAt() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return isoToLocal(date.toISOString());
}

export function toFormValues(reminder?: Reminder | null): ReminderFormValues {
  return {
    title: reminder?.title ?? "",
    kind: reminder?.kind ?? "reminder",
    remindAt: reminder ? isoToLocal(reminder.remindAt) : defaultRemindAt(),
    content: reminder?.content ?? "",
    tags: reminder?.tags ?? [],
    freq: reminder?.recurrence?.freq ?? "none",
    interval: reminder?.recurrence?.interval ?? 1,
    byWeekday: reminder?.recurrence?.byWeekday ?? [],
    until: reminder?.recurrence?.until ? isoToLocal(reminder.recurrence.until).slice(0, 10) : "",
  };
}

export function toReminderInput(values: ReminderFormValues): ReminderInput {
  const isReminder = values.kind === "reminder";
  const recurrence: Recurrence | null =
    isReminder && values.freq !== "none"
      ? {
          freq: values.freq,
          interval: values.interval,
          ...(values.freq === "weekly" ? { byWeekday: [...values.byWeekday].sort() } : {}),
          until: values.until ? new Date(`${values.until}T23:59:59`).toISOString() : null,
        }
      : null;

  return {
    title: values.title.trim(),
    kind: values.kind,
    content: values.content.trim() ? values.content : null,
    remindAt: isReminder ? localToIso(values.remindAt) : null,
    recurrence,
    tags: values.tags,
  };
}

export function ReminderForm({
  reminder,
  onSubmit,
  submitting,
  submitLabel = "Salvar",
}: {
  reminder?: Reminder | null;
  onSubmit: (input: ReminderInput) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const { data: tags = [] } = useTags();
  const form = useForm<ReminderFormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(reminder) });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "kind" });
  const freq = useWatch({ control: form.control, name: "freq" });

  useEffect(() => {
    form.reset(toFormValues(reminder));
  }, [reminder, form]);

  const submit = form.handleSubmit((values) => onSubmit(toReminderInput(values)));

  return (
    <form onSubmit={submit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  { value: "reminder", label: "Lembrete", icon: BellIcon },
                  { value: "note", label: "Anotação", icon: StickyNoteIcon },
                ] as const
              ).map((option) => {
                const active = field.value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      "relative flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="kind-active"
                        className="absolute inset-0 rounded-lg bg-background shadow-sm"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    ) : null}
                    <option.icon className="relative size-4" />
                    <span className="relative">{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        />

        <Input label="Título" autoFocus error={errors.title?.message} {...form.register("title")} />

        <AnimatePresence initial={false}>
          {kind === "reminder" ? (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
                <Input
                  label="Quando"
                  type="datetime-local"
                  error={errors.remindAt?.message}
                  {...form.register("remindAt")}
                />
                <Controller
                  control={form.control}
                  name="freq"
                  render={({ field }) => (
                    <Select
                      label="Repetir"
                      options={FREQ_OPTIONS}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value ?? "none")}
                    />
                  )}
                />
              </div>

              {freq !== "none" ? (
                <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label={`A cada quantos ${freq === "daily" ? "dias" : freq === "weekly" ? "semanas" : freq === "monthly" ? "meses" : "anos"}`}
                      type="number"
                      min={1}
                      max={365}
                      error={errors.interval?.message}
                      {...form.register("interval", { valueAsNumber: true })}
                    />
                    <Input label="Até (opcional)" type="date" error={errors.until?.message} {...form.register("until")} />
                  </div>
                  {freq === "weekly" ? (
                    <Controller
                      control={form.control}
                      name="byWeekday"
                      render={({ field }) => (
                        <div>
                          <div className="flex gap-1.5" role="group" aria-label="Dias da semana">
                            {WEEKDAYS.map((letter, day) => {
                              const active = field.value.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={WEEKDAY_NAMES[day]}
                                  onClick={() =>
                                    field.onChange(
                                      active ? field.value.filter((d) => d !== day) : [...field.value, day],
                                    )
                                  }
                                  className={cn(
                                    "size-9 rounded-full text-sm font-medium transition-colors",
                                    active
                                      ? "bg-foreground text-background"
                                      : "bg-muted text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {letter}
                                </button>
                              );
                            })}
                          </div>
                          {errors.byWeekday?.message ? (
                            <p className="mt-1.5 text-[13px] text-destructive">{errors.byWeekday.message}</p>
                          ) : null}
                        </div>
                      )}
                    />
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Controller
          control={form.control}
          name="tags"
          render={({ field }) => (
            <TagsInput
              label="Tags"
              value={field.value}
              onChange={field.onChange}
              suggestions={tags.map((t) => t.name)}
              hint="Enter ou vírgula para adicionar"
            />
          )}
        />

        <Textarea
          label="Conteúdo (Markdown)"
          rows={6}
          error={errors.content?.message}
          {...form.register("content")}
        />
      </div>

      <div className="sticky bottom-0 -mx-1 mt-6 flex justify-end gap-2 bg-popover/95 px-1 pt-3 backdrop-blur">
        <Button type="submit" size="lg" className="h-10 px-5" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
