"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { SparklesIcon, UserIcon } from "lucide-react";

const items = [
  { href: "/settings", label: "Perfil", icon: UserIcon },
  { href: "/settings/ai", label: "Inteligência artificial", icon: SparklesIcon },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Configurações" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
