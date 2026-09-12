"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { PanelLeftIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "./logo";
import { Nav } from "./nav";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import { RAIL_WIDTH, SIDEBAR_WIDTH, sidebarTransition } from "./sidebar-item";
import { UserMenu } from "./user-menu";

/** Estado de colapso persistido em cookie, para o layout renderizar já na largura certa. */
export function useSidebarCollapsed(defaultCollapsed: boolean) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const set = (value: boolean) => {
    setCollapsed(value);
    document.cookie = `${SIDEBAR_COOKIE}=${value ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return { collapsed, toggle: () => set(!collapsed), expand: () => set(false) };
}

function useSidebarMode() {
  const pathname = usePathname();
  return pathname === "/chat" || pathname.startsWith("/chat/") ? "chat" : "app";
}

/**
 * Corpo da sidebar, compartilhado entre o `aside` fixo do desktop e o
 * `Sheet` do mobile. No chat, a navegação principal dá lugar à lista de
 * conversas com um botão de voltar.
 */
export function SidebarBody({
  collapsed = false,
  onToggle,
  onExpand,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onExpand?: () => void;
  onNavigate?: () => void;
}) {
  const mode = useSidebarMode();

  return (
    <div className="flex h-full flex-col px-2">
      <SidebarHeader collapsed={collapsed} onToggle={onToggle} />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === "chat" ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "chat" ? 16 : -16 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex h-full flex-col"
          >
            {mode === "chat" ? (
              <ChatSidebar collapsed={collapsed} onExpand={onExpand} onNavigate={onNavigate} />
            ) : (
              <Nav collapsed={collapsed} onNavigate={onNavigate} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-t border-border/60 py-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const toggleLabel = collapsed ? "Abrir barra lateral" : "Fechar barra lateral";

  return (
    <div className="flex h-14 shrink-0 items-center overflow-hidden pl-1.5">
      {/* Colapsada, a marca vira o botão de abrir ao passar o mouse. */}
      <div className="group/brand relative grid size-7 shrink-0 place-items-center">
        <Logo compact className={cn("transition-opacity", collapsed && "group-hover/brand:opacity-0")} />
        {collapsed && onToggle ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label={toggleLabel}
                  className="absolute inset-0 grid place-items-center rounded-lg text-foreground/80 opacity-0 transition-opacity group-hover/brand:opacity-100 hover:bg-muted focus-visible:opacity-100"
                />
              }
            >
              <PanelLeftIcon className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {toggleLabel}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <motion.span
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={sidebarTransition}
        className="ml-2 flex-1 overflow-hidden text-[15px] font-semibold tracking-tight whitespace-nowrap"
      >
        FindRemind
      </motion.span>

      {onToggle ? (
        <motion.div
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={sidebarTransition}
          inert={collapsed}
          className="shrink-0"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label={toggleLabel}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <PanelLeftIcon className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
          </Tooltip>
        </motion.div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onExpand,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH }}
      transition={sidebarTransition}
      className="sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-border/60 bg-sidebar lg:block"
    >
      <SidebarBody collapsed={collapsed} onToggle={onToggle} onExpand={onExpand} />
    </motion.aside>
  );
}
