"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Input } from "@/components/form/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/auth-client";
import { AuthCard } from "./auth-card";
import { PasswordInput } from "./password-input";

const schema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe sua senha"),
});

type Values = z.infer<typeof schema>;

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/reminders";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await signIn.email(values);
    if (error) {
      setServerError(
        error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "E-mail ou senha incorretos."
          : (error.message ?? "Não foi possível entrar."),
      );
      return;
    }
    router.replace(safeNext(params.get("next")));
    router.refresh();
  });

  return (
    <AuthCard
      title="Entrar"
      description="Acesse seus lembretes e anotações."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <Input label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...form.register("email")} />
        <PasswordInput
          label="Senha"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register("password")}
        />
        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="mt-2 h-11 w-full text-[15px]" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}
