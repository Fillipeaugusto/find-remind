"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAlertStream } from "@/hooks/use-alerts";
import { Logo } from "./logo";
import { Sidebar, SidebarBody, useSidebarCollapsed } from "./sidebar";

export function AppShell({
  children,
  defaultCollapsed = false,
}: {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sidebar = useSidebarCollapsed(defaultCollapsed);
  useAlertStream();

  return (
    <div className="flex min-h-dvh w-full">
      <Sidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} onExpand={sidebar.expand} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <MenuIcon />
          </Button>
          <Logo />
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
