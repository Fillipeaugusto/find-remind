"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Input } from "@/components/form/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { detectTimezone, signUp } from "@/lib/auth-client";
import { AuthCard } from "./auth-card";
import { PasswordInput } from "./password-input";

const schema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome"),
    email: z.email("Informe um e-mail válido"),
    password: z.string().min(8, "Use pelo menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem" });

type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      timezone: detectTimezone(),
    });
    if (error) {
      setServerError(
        error.code === "USER_ALREADY_EXISTS" || error.status === 422
          ? "Já existe uma conta com esse e-mail."
          : (error.message ?? "Não foi possível criar a conta."),
      );
      return;
    }
    router.replace("/reminders");
    router.refresh();
  });

  return (
    <AuthCard
      title="Criar conta"
      description="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <Input label="Nome" autoComplete="name" error={errors.name?.message} {...form.register("name")} />
        <Input label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...form.register("email")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <PasswordInput
            label="Senha"
            autoComplete="new-password"
            error={errors.password?.message}
            {...form.register("password")}
          />
          <PasswordInput
            label="Confirmar senha"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...form.register("confirm")}
          />
        </div>
        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-2 h-11 w-full text-[15px]" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
