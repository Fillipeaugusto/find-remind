"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { cn } from "cn";
import { ArrowLeftIcon, EllipsisIcon, MessagesSquareIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { SidebarItem, SidebarSection, sidebarTransition } from "@/components/layout/sidebar-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
import { errorMessage } from "@/lib/api";
import type { Conversation } from "@/lib/types";

/**
 * Conteúdo da sidebar dentro do chat: botão de voltar, nova conversa e a
 * lista de conversas recentes. Substitui a navegação principal enquanto o
 * usuário está em /chat.
 */
export function ChatSidebar({
  collapsed = false,
  onExpand,
  onNavigate,
}: {
  collapsed?: boolean;
  onExpand?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const query = useConversations();
  const remove = useDeleteConversation();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const del = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      if (params.id === id) router.replace("/chat");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5">
        <SidebarItem href="/reminders" label="Voltar" icon={<ArrowLeftIcon />} collapsed={collapsed} onClick={onNavigate} />
        <SidebarItem
          href="/chat"
          label="Nova conversa"
          icon={<SquarePenIcon />}
          active={pathname === "/chat"}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        {collapsed ? (
          <SidebarItem label="Conversas" icon={<MessagesSquareIcon />} collapsed onClick={onExpand} />
        ) : null}
      </div>

      <motion.div
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={sidebarTransition}
        className={cn("flex min-h-0 flex-1 flex-col", collapsed && "pointer-events-none")}
        aria-hidden={collapsed}
      >
        <SidebarSection label="Recentes" />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 scrollbar-thin">
          {query.isPending ? (
            <div className="space-y-1 px-[11px] pt-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-[70%] rounded" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-[11px] pt-1 text-xs text-muted-foreground/70">Suas conversas aparecem aqui.</p>
          ) : (
            <ul className="flex flex-col gap-px">
              {items.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={params.id === conversation.id}
                  deleting={remove.isPending && remove.variables === conversation.id}
                  onDelete={() => del(conversation.id)}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
          {query.hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start px-[11px] text-muted-foreground"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? <Spinner /> : null} Carregar mais
            </Button>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  deleting,
  onDelete,
  onNavigate,
}: {
  conversation: Conversation;
  active: boolean;
  deleting: boolean;
  onDelete: () => void;
  onNavigate?: () => void;
}) {
  return (
    <li className="group/row relative">
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center rounded-lg pr-9 pl-[11px] text-sm transition-colors",
          active ? "bg-muted text-foreground" : "text-foreground/85 hover:bg-muted/70 hover:text-foreground",
        )}
      >
        {/* Títulos longos somem num fade à direita, sem reticências. */}
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]">
          {conversation.title ?? "Nova conversa"}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Opções da conversa"
          className={cn(
            "absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-opacity",
            "opacity-0 group-hover/row:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100",
            active && "opacity-100",
          )}
        >
          {deleting ? <Spinner className="size-3.5" /> : <EllipsisIcon className="size-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-44">
          <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={deleting}>
            <Trash2Icon /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
