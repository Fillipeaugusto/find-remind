"use client";

import { useState } from "react";
import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConversationList } from "./conversation-list";

export function ChatShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-1 lg:h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-sidebar/60 md:block">
        <ConversationList />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Conversas</SheetTitle>
          <ConversationList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Conversas"
          className="absolute top-3 left-3 z-10 md:hidden"
          onClick={() => setOpen(true)}
        >
          <PanelLeftIcon />
        </Button>
        {children}
      </div>
    </div>
  );
}
