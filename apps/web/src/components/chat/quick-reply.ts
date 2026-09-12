"use client";

import { createContext, useContext } from "react";

/**
 * Como uma pergunta feita pela IA (tool `askUser`) pode ser respondida.
 * Só a última mensagem da conversa aceita resposta; nas anteriores a
 * pergunta aparece com a resposta que o usuário deu.
 */
export type QuickReply = {
  /** A pergunta ainda está aberta e pode ser respondida com um clique. */
  active: boolean;
  /** Texto da mensagem do usuário que veio logo depois, se houver. */
  answered?: string;
  onAnswer: (text: string) => void;
  focusComposer: () => void;
};

export const QuickReplyContext = createContext<QuickReply | null>(null);

export function useQuickReply() {
  return useContext(QuickReplyContext);
}
