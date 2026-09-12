"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAsk, useSearch } from "@/hooks/use-search";
import { errorMessage, isApiError } from "@/lib/api";
import { STATUS_LABEL, formatDate } from "@/lib/format";
import type { SearchMode } from "@/lib/types";
import { SearchResult } from "./search-result";

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: "hybrid", label: "Híbrida", hint: "Palavras-chave + significado" },
  { value: "keyword", label: "Palavras-chave", hint: "Correspondência de texto" },
  { value: "semantic", label: "Semântica", hint: "Por significado (embeddings)" },
];

const EXAMPLES = [
  "o que eu anotei sobre a reunião de segunda?",
  "lembretes com a tag trabalho da semana passada",
  "qual alerta eu criei ontem à noite?",
];

function isMode(value: string | null): value is SearchMode {
  return MODES.some((m) => m.value === value);
}

function NoEmbeddingNotice() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <p className="font-medium">Nenhum modelo de embeddings configurado</p>
      <p className="mt-1 text-muted-foreground">
        A busca semântica precisa de um provedor de IA com modelo de embeddings ativo. Enquanto isso, use a busca por
        palavras-chave.
      </p>
      <Button variant="outline" size="sm" className="mt-3" nativeButton={false} render={<Link href="/settings/ai" />}>
        <SparklesIcon /> Configurar IA
      </Button>
    </div>
  );
}

export function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [text, setText] = useState(initialQ);
  const [mode, setMode] = useState<SearchMode>(isMode(params.get("mode")) ? (params.get("mode") as SearchMode) : "hybrid");
  const [ask, setAsk] = useState(params.get("ask") === "1");
  const [submitted, setSubmitted] = useState(initialQ);

  const search = useSearch(!ask && submitted ? { q: submitted, mode } : null);
  const asked = useAsk();

  useEffect(() => {
    const next = new URLSearchParams();
    if (submitted) next.set("q", submitted);
    if (mode !== "hybrid") next.set("mode", mode);
    if (ask) next.set("ask", "1");
    const qs = next.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [submitted, mode, ask, router]);

  const submit = (value = text) => {
    const q = value.trim();
    setText(q);
    setSubmitted(q);
    if (ask && q) asked.mutate(q);
  };

  useEffect(() => {
    if (ask && initialQ && !asked.data && !asked.isPending) asked.mutate(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = ask ? asked.isPending : search.isFetching;
  const error = ask ? asked.error : search.error;
  const items = ask ? asked.data?.items : search.data?.items;
  const noEmbedding = isApiError(error, 409, "NO_EMBEDDING_PROVIDER") || isApiError(error, 409);

  return (
    <PageContainer>
      <PageHeader title="Buscar" description="Procure por palavras, por significado ou simplesmente pergunte." />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6"
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl border border-input bg-background pr-2 pl-4 transition-[border-color,box-shadow]",
            "focus-within:border-foreground focus-within:shadow-[inset_0_0_0_1px_var(--foreground)]",
          )}
        >
          {ask ? <SparklesIcon className="size-4.5 shrink-0 text-muted-foreground" /> : <SearchIcon className="size-4.5 shrink-0 text-muted-foreground" />}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ask ? "Pergunte: qual alerta criei na segunda passada?" : "Buscar lembretes e anotações"}
            aria-label={ask ? "Pergunta" : "Busca"}
            autoFocus
            className="h-13 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          {text ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Limpar"
              onClick={() => {
                setText("");
                setSubmitted("");
                asked.reset();
              }}
            >
              <XIcon />
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="h-9" disabled={loading || !text.trim()}>
            {loading ? <Spinner /> : null}
            {ask ? "Perguntar" : "Buscar"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Modo de busca" className="flex gap-1 rounded-xl bg-muted p-1">
            {MODES.map((m) => {
              const active = !ask && mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={m.hint}
                  onClick={() => {
                    setAsk(false);
                    setMode(m.value);
                  }}
                  className={cn(
                    "relative h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="search-mode"
                      className="absolute inset-0 rounded-lg bg-background shadow-sm"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  ) : null}
                  <span className="relative">{m.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={ask}
              onClick={() => setAsk(true)}
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                ask ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ask ? (
                <motion.span
                  layoutId="search-mode"
                  className="absolute inset-0 rounded-lg bg-background shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
              <SparklesIcon className="relative size-3.5" />
              <span className="relative">Perguntar</span>
            </button>
          </div>
          {!ask && search.data ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {search.data.items.length} resultado{search.data.items.length === 1 ? "" : "s"} · {search.data.tookMs} ms
              {search.data.cached ? " · cache" : ""}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-6">
        {!submitted ? (
          <div className="rounded-2xl border border-dashed border-border p-6">
            <p className="text-sm font-medium">Experimente perguntar</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => {
                      setAsk(true);
                      setText(example);
                      setSubmitted(example);
                      asked.mutate(example);
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : loading && !items ? (
          <div className="space-y-3">
            {ask ? <Skeleton className="h-24 rounded-2xl" /> : null}
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          noEmbedding ? (
            <NoEmbeddingNotice />
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>A busca falhou</EmptyTitle>
                <EmptyDescription>{errorMessage(error)}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {ask && asked.data ? (
                <motion.section
                  key="answer"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-border/70 bg-card p-5"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <SparklesIcon className="size-3.5" /> Resposta
                  </div>
                  <Markdown className="mt-2">{asked.data.answer}</Markdown>
                  <FilterChips filters={asked.data.filters} />
                </motion.section>
              ) : null}
            </AnimatePresence>

            {items && items.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nada encontrado</EmptyTitle>
                  <EmptyDescription>Tente outras palavras ou mude o modo de busca.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : items ? (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <SearchResult key={item.reminder.id} item={item} index={index} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function FilterChips({ filters }: { filters: { from?: string; to?: string; tags?: string[]; status?: string } }) {
  const chips: string[] = [];
  if (filters.from && filters.to) chips.push(`${formatDate(filters.from)} → ${formatDate(filters.to)}`);
  else if (filters.from) chips.push(`a partir de ${formatDate(filters.from)}`);
  else if (filters.to) chips.push(`até ${formatDate(filters.to)}`);
  filters.tags?.forEach((tag) => chips.push(`#${tag}`));
  if (filters.status) chips.push(STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL] ?? filters.status);
  if (!chips.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Filtros aplicados:</span>
      {chips.map((chip) => (
        <span key={chip} className="rounded-md bg-muted px-2 py-0.5 text-xs">
          {chip}
        </span>
      ))}
    </div>
  );
}
