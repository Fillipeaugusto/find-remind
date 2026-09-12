"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "cn";
import { MessageSquareIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
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
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          nativeButton={false} render={<Link href="/chat" onClick={onNavigate} />}
        >
          <PlusIcon /> Nova conversa
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {query.isPending ? (
          <div className="space-y-1 px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 pt-6 text-center text-xs text-muted-foreground">
            Suas conversas aparecem aqui.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((conversation) => {
              const active = params.id === conversation.id;
              return (
                <li key={conversation.id} className="group relative">
                  <Link
                    href={`/chat/${conversation.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg py-2 pr-8 pl-2.5 text-sm transition-colors",
                      active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <MessageSquareIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{conversation.title ?? "Nova conversa"}</span>
                      <span className="block truncate text-[11px] text-muted-foreground/80">
                        {formatRelative(conversation.updatedAt)}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Excluir conversa"
                    onClick={() => del(conversation.id)}
                    disabled={remove.isPending}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100"
                  >
                    {remove.isPending && remove.variables === conversation.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Trash2Icon className="size-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? <Spinner /> : null} Carregar mais
          </Button>
        ) : null}
      </div>
    </div>
  );
}
