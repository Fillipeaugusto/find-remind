"use client";

import { usePathname } from "next/navigation";
import { BellIcon, BellRingIcon, MessageSquareIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { useUnreadCount } from "@/hooks/use-alerts";
import { SidebarItem } from "./sidebar-item";

const items = [
  { href: "/reminders", label: "Lembretes", icon: BellIcon },
  { href: "/search", label: "Buscar", icon: SearchIcon },
  { href: "/chat", label: "Chat", icon: MessageSquareIcon },
  { href: "/alerts", label: "Alertas", icon: BellRingIcon },
  { href: "/settings", label: "Configurações", icon: SettingsIcon },
] as const;

export function Nav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadCount();

  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = href === "/alerts" && unread > 0 ? unread : null;
        return (
          <SidebarItem
            key={href}
            href={href}
            label={label}
            icon={<Icon />}
            active={active}
            collapsed={collapsed}
            onClick={onNavigate}
            trailing={
              badge ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] font-medium text-background">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null
            }
          />
        );
      })}
    </nav>
  );
}
