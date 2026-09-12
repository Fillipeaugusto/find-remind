"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "@/hooks/use-conversations";
import { errorMessage, isApiError } from "@/lib/api";
import { ChatSession } from "./chat-session";

export function ChatView({ id }: { id: string }) {
  const query = useConversation(id);

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
        <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
        <Skeleton className="h-24 w-3/4 rounded-2xl" />
        <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
      </div>
    );
  }

  if (query.isError) {
    const notFound = isApiError(query.error, 404);
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{notFound ? "Conversa não encontrada" : "Não foi possível carregar"}</EmptyTitle>
            <EmptyDescription>{notFound ? "Ela pode ter sido excluída." : errorMessage(query.error)}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" nativeButton={false} render={<Link href="/chat" />}>
            <ArrowLeftIcon /> Nova conversa
          </Button>
        </Empty>
      </div>
    );
  }

  return <ChatSession key={id} conversation={query.data.conversation} initialMessages={query.data.messages} />;
}
