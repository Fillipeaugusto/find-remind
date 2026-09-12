import { Fragment } from "react";

/**
 * Converte um highlight do Elasticsearch (texto com `<em>…</em>`) em nós React,
 * tratando qualquer outra tag como texto literal.
 */
export function renderHighlight(html: string) {
  const parts = html.split(/(<em>|<\/em>)/);
  const nodes: React.ReactNode[] = [];
  let inside = false;
  parts.forEach((part, index) => {
    if (part === "<em>") {
      inside = true;
      return;
    }
    if (part === "</em>") {
      inside = false;
      return;
    }
    if (!part) return;
    const text = part.replace(/<[^>]+>/g, "");
    nodes.push(inside ? <mark key={index}>{text}</mark> : <Fragment key={index}>{text}</Fragment>);
  });
  return nodes;
}
