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
import { userMessageText } from "./message-parts";
import { ModelLabel } from "./model-picker";

const NEAR_BOTTOM_PX = 80;

function scrollToBottom(behavior: ScrollBehavior) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
}

function isNearBottom() {
  return document.documentElement.scrollHeight - window.innerHeight - window.scrollY < NEAR_BOTTOM_PX;
}

/**
 * A conversa rola com a página; o composer é sticky no rodapé, então nunca
 * sai da tela. Enquanto o usuário está no fim, novas mensagens mantêm o
 * scroll colado embaixo; se ele subiu, um botão leva de volta ao fim.
 */
export function ChatSession({
  conversation,
  initialMessages,
}: {
  conversation: Conversation;
  initialMessages: UIMessage[];
}) {
  const queryClient = useQueryClient();
  const composerRef = useRef<HTMLTextAreaElement>(null);
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

  const send = (text: string) => {
    stickToBottom.current = true;
    return sendMessage({ text });
  };

  // Mensagem digitada na tela "nova conversa" antes da conversa existir.
  useEffect(() => {
    const pending = takePendingMessage(conversation.id);
    if (pending) void sendMessage({ text: pending });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    const onScroll = () => {
      const near = isNearBottom();
      stickToBottom.current = near;
      setAtBottom(near);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom("instant");
  }, [messages]);

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-14 z-20 flex h-12 shrink-0 items-center justify-center bg-background/85 px-4 backdrop-blur lg:top-0 lg:h-14 lg:justify-start lg:px-5">
        <h1 className="truncate text-sm font-medium">{conversation.title ?? "Nova conversa"}</h1>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-6 sm:px-6">
        {messages.map((message, index) => {
          const next = messages[index + 1];
          return (
            <ChatMessage
              key={message.id}
              message={message}
              streaming={busy && message.id === lastMessage?.id && message.role === "assistant"}
              quickReply={
                message.role === "assistant"
                  ? {
                      active: !busy && index === messages.length - 1,
                      answered: next?.role === "user" ? userMessageText(next) : undefined,
                      onAnswer: (text) => void send(text),
                      focusComposer: () => composerRef.current?.focus(),
                    }
                  : undefined
              }
            />
          );
        })}
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
      </div>

      <div className="sticky bottom-0 z-20 bg-linear-to-t from-background via-background to-transparent px-4 pt-4 pb-4 sm:px-6">
        <div className="relative mx-auto max-w-3xl">
          {!atBottom ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Ir para o fim"
              className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-sm"
              onClick={() => {
                stickToBottom.current = true;
                setAtBottom(true);
                scrollToBottom("smooth");
              }}
            >
              <ArrowDownIcon />
            </Button>
          ) : null}
          <Composer
            inputRef={composerRef}
            onSend={send}
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
