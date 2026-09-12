const PREFIX = "findremind:pending-message:";

/** Guarda a primeira mensagem de uma conversa recém-criada até a página dela montar. */
export function stashPendingMessage(conversationId: string, text: string) {
  try {
    sessionStorage.setItem(PREFIX + conversationId, text);
  } catch {
    // storage indisponível — a mensagem simplesmente não é reenviada
  }
}

export function takePendingMessage(conversationId: string) {
  try {
    const key = PREFIX + conversationId;
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
