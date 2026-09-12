"use client";

import Link from "next/link";
import { cn } from "cn";
import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const SIDEBAR_WIDTH = 260;
export const RAIL_WIDTH = 56;

/** Transição compartilhada por tudo que anima junto com a largura da sidebar. */
export const sidebarTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const;

type SidebarItemProps = {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  collapsed?: boolean;
  trailing?: React.ReactNode;
  className?: string;
};

/**
 * Linha da sidebar: ícone fixo à esquerda e rótulo que some quando ela
 * colapsa. O item encolhe junto com a sidebar e clipa o texto (sem
 * reticências), então o rótulo "entra" na borda em vez de reposicionar.
 */
export function SidebarItem({ icon, label, href, onClick, active, collapsed, trailing, className }: SidebarItemProps) {
  const content = (
    <>
      <span className="grid size-[18px] shrink-0 place-items-center [&_svg]:size-[18px]">{icon}</span>
      <motion.span
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={sidebarTransition}
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
      >
        {label}
      </motion.span>
      {trailing && !collapsed ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  const classes = cn(
    "flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-[11px] text-left text-sm transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring/50",
    active ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
    className,
  );

  const element = href ? (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined} aria-label={label} className={classes}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={classes}>
      {content}
    </button>
  );

  if (!collapsed) return element;

  return (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarSection({ label, collapsed }: { label: string; collapsed?: boolean }) {
  return (
    <motion.p
      animate={{ opacity: collapsed ? 0 : 1 }}
      transition={sidebarTransition}
      className="mt-5 mb-1 truncate px-[11px] text-xs text-muted-foreground"
    >
      {label}
    </motion.p>
  );
}
