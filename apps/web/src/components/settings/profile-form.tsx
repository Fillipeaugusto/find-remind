"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Input } from "@/components/form/input";
import { Select } from "@/components/form/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useMe, useUpdateMe } from "@/hooks/use-me";
import { errorMessage } from "@/lib/api";
import { detectTimezone } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome"),
  timezone: z.string().min(1, "Escolha um fuso horário"),
});

type Values = z.infer<typeof schema>;

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/Sao_Paulo"];
  }
}

export function ProfileForm() {
  const { data: me, isPending } = useMe();
  const update = useUpdateMe();
  const options = useMemo(() => timezones().map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") })), []);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", timezone: "" },
  });

  useEffect(() => {
    if (me) form.reset({ name: me.name, timezone: me.timezone });
  }, [me, form]);

  if (isPending || !me) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-13 rounded-xl" />
        <Skeleton className="h-13 rounded-xl" />
        <Skeleton className="h-13 rounded-xl" />
      </div>
    );
  }

  const { errors, isDirty } = form.formState;
  const detected = detectTimezone();

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success("Perfil atualizado");
      form.reset(values);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Perfil</h2>
        <Input label="Nome" autoComplete="name" error={errors.name?.message} {...form.register("name")} />
        <Input label="E-mail" type="email" value={me.email} readOnly disabled hint="O e-mail não pode ser alterado por aqui." />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Fuso horário</h2>
        <Controller
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <Select
              label="Fuso horário"
              options={options}
              value={field.value}
              onValueChange={(value) => field.onChange(value ?? "")}
              error={errors.timezone?.message}
              hint={
                field.value !== detected ? (
                  <>
                    Seu navegador está em <strong>{detected}</strong>.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4 hover:text-foreground"
                      onClick={() => field.onChange(detected)}
                    >
                      Usar esse
                    </button>
                  </>
                ) : (
                  "Usado para interpretar datas como “segunda passada” na busca e no chat."
                )
              }
            />
          )}
        />
      </section>

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-muted-foreground">Conta criada em {formatDate(me.createdAt)}</p>
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? <Spinner /> : null}
          Salvar
        </Button>
      </div>
    </form>
  );
}
