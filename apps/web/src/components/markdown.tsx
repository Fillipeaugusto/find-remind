"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

// U+FFFD aparece quando o modelo emite um token que quebra um caractere
// multibyte; o símbolo não carrega informação, então não é exibido.
const REPLACEMENT_CHARACTER = /\uFFFD/g;

export function Markdown({ children, className }: { children: string; className?: string }) {
  const text = children.replace(REPLACEMENT_CHARACTER, "");
  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
