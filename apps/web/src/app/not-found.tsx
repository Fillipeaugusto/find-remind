import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <div>
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">O endereço pode estar errado ou a página foi movida.</p>
      </div>
      <Button nativeButton={false} render={<Link href="/reminders" />}>Ir para os lembretes</Button>
    </div>
  );
}
