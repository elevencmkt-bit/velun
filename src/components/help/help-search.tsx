"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { foldText, searchHelp, type HelpSearchEntry } from "@/lib/help/content";
import { startNavProgress } from "@/components/nav-progress";

/** Marca no texto os trechos que batem com a busca, ignorando acento. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const folded = foldText(text);
  const marks: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const i = folded.indexOf(w, from);
      if (i < 0) break;
      marks.push([i, i + w.length]);
      from = i + w.length;
    }
  }
  if (marks.length === 0) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (s < at) continue;
    if (s > at) out.push(text.slice(at, s));
    out.push(
      <mark key={s} className="rounded-[3px] bg-(--warning-soft) text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * Busca da central: filtra os artigos enquanto digita. `hero` é a busca
 * grande da página inicial; `compact` fica no topo das outras páginas
 * (e some na inicial, que já tem a grande).
 */
export function HelpSearch({ index, variant }: { index: HelpSearchEntry[]; variant: "hero" | "compact" }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = (href: string) => {
    startNavProgress();
    router.push(href);
  };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchHelp(index, query, variant === "hero" ? 6 : 5), [index, query, variant]);
  const words = useMemo(() => foldText(query).split(/\s+/).filter((w) => w.length >= 2), [query]);
  const showList = open && query.trim().length >= 2;

  if (variant === "compact" && pathname === "/ajuda") return null;

  const hero = variant === "hero";

  return (
    <div
      ref={boxRef}
      className={`relative ${hero ? "w-full max-w-[640px]" : "w-full sm:w-[280px]"}`}
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Buscar na ajuda
      </label>
      <div
        className={`flex items-center gap-3 transition-shadow ${
          hero
            ? "h-14 rounded-[16px] border-[1.5px] border-(--border-primary) bg-(--bg-surface) px-[18px] focus-within:border-(--primary) focus-within:shadow-[0_0_0_4px_var(--primary-soft)]"
            : "h-10 rounded-[12px] bg-(--bg-subtle) px-3 focus-within:shadow-[0_0_0_3px_var(--primary-soft)]"
        }`}
      >
        <Search className={`${hero ? "h-5 w-5" : "h-4 w-4"} shrink-0 text-(--text-muted)`} aria-hidden />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={hero ? "Busque: fatura, importar, convite…" : "Buscar na ajuda"}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              setOpen(false);
              navigate(results[active].href);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={`min-w-0 flex-1 bg-transparent text-(--text-primary) outline-none placeholder:text-(--text-light) [&::-webkit-search-cancel-button]:hidden ${
            hero ? "text-[16px]" : "text-[14px]"
          }`}
        />
        {query ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--text-muted) hover:bg-(--bg-hover)"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showList ? (
        <div
          id={listId}
          role="listbox"
          className={`absolute right-0 left-0 z-30 mt-2 rounded-[18px] bg-(--bg-surface) p-2 shadow-[0_18px_50px_rgba(16,24,40,.18)] ${
            hero ? "" : "sm:left-auto sm:w-[400px]"
          }`}
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-(--text-muted)">
              Nada encontrado pra “{query.trim()}”. Tente outra palavra ou veja os assuntos.
            </p>
          ) : (
            results.map((r, i) => (
              <Link
                key={r.href}
                href={r.href}
                role="option"
                aria-selected={i === active}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
                className={`flex flex-col gap-0.5 rounded-[12px] px-3.5 py-3 text-left ${
                  i === active ? "bg-(--primary-soft)" : ""
                }`}
              >
                <span className="text-[14px] font-semibold text-(--text-primary)">
                  <Highlight text={r.title} words={words} />
                </span>
                <span className="text-[13px] leading-snug text-(--text-muted)">
                  {r.topic} · <Highlight text={r.summary} words={words} />
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
