"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{error.message || "Erro inesperado."}</p>
      </div>
      <Button onClick={reset}>Tentar de novo</Button>
    </div>
  );
}
