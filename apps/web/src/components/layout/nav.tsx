"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { BellIcon, BellRingIcon, MessageSquareIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { motion } from "motion/react";
import { useUnreadCount } from "@/hooks/use-alerts";

const items = [
  { href: "/reminders", label: "Lembretes", icon: BellIcon },
  { href: "/search", label: "Buscar", icon: SearchIcon },
  { href: "/chat", label: "Chat", icon: MessageSquareIcon },
  { href: "/alerts", label: "Alertas", icon: BellRingIcon },
  { href: "/settings", label: "Configurações", icon: SettingsIcon },
] as const;

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadCount();

  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = href === "/alerts" && unread > 0 ? unread : null;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg bg-muted"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <Icon className="relative size-4" />
            <span className="relative flex-1">{label}</span>
            {badge ? (
              <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] font-medium text-background">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
