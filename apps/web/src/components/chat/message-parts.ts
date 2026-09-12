import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import type { ToolPartLike } from "./tool-parts";

type Part = UIMessage["parts"][number];

/** Item do processo interno da resposta: fica na sanfona, fechado por padrão. */
export type ProcessEntry =
  | { kind: "reasoning"; text: string }
  | { kind: "attempt"; name: string; errorText?: string }
  | { kind: "step"; name: string; input?: unknown; output?: unknown };

/** Item visível da resposta: texto ou resultado de ferramenta que interessa ao usuário. */
export type BodyItem = { kind: "text"; text: string } | { kind: "tool"; name: string; part: ToolPartLike & { type: string } };

export type GroupedParts = {
  process: ProcessEntry[];
  /** O modelo ainda está raciocinando (nada visível chegou depois). */
  thinking: boolean;
  body: BodyItem[];
};

/** Ferramentas cujo resultado é só uma etapa intermediária, não conteúdo. */
const INTERNAL_TOOLS = new Set(["resolveDateRange"]);

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text";
}

/**
 * Separa as parts de uma mensagem do assistente entre o que o usuário quer
 * ver (texto, cards, tabelas) e o que só polui (raciocínio, tentativas que
 * falharam, etapas internas). Uma chamada que falhou vai para o processo
 * quando o modelo seguiu em frente depois dela (nova chamada ou texto
 * explicando); se a falha foi a última palavra, ela continua visível.
 */
export function groupMessageParts(parts: Part[], streaming = false): GroupedParts {
  const process: ProcessEntry[] = [];
  const body: BodyItem[] = [];

  parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      if (part.text.trim()) process.push({ kind: "reasoning", text: part.text });
      return;
    }
    if (isTextPart(part)) {
      if (part.text.trim() || (streaming && index === parts.length - 1)) body.push({ kind: "text", text: part.text });
      return;
    }
    if (!isToolUIPart(part)) return;

    const name = getToolName(part);
    if (part.state === "output-error") {
      const movedOn = parts
        .slice(index + 1)
        .some((later) => (isTextPart(later) && later.text.trim()) || (isToolUIPart(later) && later.state !== "output-error"));
      if (movedOn) {
        process.push({ kind: "attempt", name, errorText: part.errorText });
        return;
      }
    } else if (INTERNAL_TOOLS.has(name) && part.state === "output-available") {
      process.push({ kind: "step", name, input: part.input, output: part.output });
      return;
    }
    body.push({ kind: "tool", name, part });
  });

  return { process, thinking: streaming && parts.at(-1)?.type === "reasoning", body };
}

/** Texto de uma mensagem do usuário (parts de texto concatenadas). */
export function userMessageText(message: Pick<UIMessage, "parts">): string {
  return message.parts.filter(isTextPart).map((part) => part.text).join("\n");
}
