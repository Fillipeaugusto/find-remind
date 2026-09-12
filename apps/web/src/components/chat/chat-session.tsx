"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowDownIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { takePendingMessage } from "@/lib/pending-message";
import type { Conversation } from "@/lib/types";
import { Composer } from "./composer";
import { ChatMessage } from "./message";
import { ModelLabel } from "./model-picker";

export function ChatSession({
  conversation,
  initialMessages,
}: {
  conversation: Conversation;
  initialMessages: UIMessage[];
}) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    id: conversation.id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `${API_URL}/chat/conversations/${conversation.id}/messages`,
      credentials: "include",
    }),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
      void queryClient.invalidateQueries({ queryKey: ["reminders"] });
      void queryClient.invalidateQueries({ queryKey: keys.tags });
    },
  });

  const busy = status === "submitted" || status === "streaming";

  // Mensagem digitada na tela "nova conversa" antes da conversa existir.
  useEffect(() => {
    const pending = takePendingMessage(conversation.id);
    if (pending) void sendMessage({ text: pending });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = near;
    setAtBottom(near);
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-center px-4 lg:justify-start lg:px-5">
        <h1 className="truncate text-sm font-medium">{conversation.title ?? "Nova conversa"}</h1>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              streaming={busy && message.id === lastMessage?.id && message.role === "assistant"}
            />
          ))}
          {status === "submitted" && lastMessage?.role === "user" ? (
            <ChatMessage message={{ id: "pending", role: "assistant", parts: [] }} streaming />
          ) : null}
          {error ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="flex-1 text-destructive">{error.message || "A resposta falhou."}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
              >
                <RefreshCwIcon /> Tentar de novo
              </Button>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6">
        <div className="relative mx-auto max-w-3xl">
          {!atBottom ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Ir para o fim"
              className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
              onClick={() => {
                stickToBottom.current = true;
                setAtBottom(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
              }}
            >
              <ArrowDownIcon />
            </Button>
          ) : null}
          <Composer
            onSend={(text) => {
              stickToBottom.current = true;
              return sendMessage({ text });
            }}
            onStop={stop}
            busy={busy}
            leading={<ModelLabel model={conversation.model} />}
          />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            A IA pode errar. Confira lembretes importantes antes de confiar.
          </p>
        </div>
      </div>
    </div>
  );
}
