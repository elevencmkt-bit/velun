"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCategoryIcon } from "@/lib/category-icons";
import { themedPair } from "@/lib/theme-color";
import { useCategoryUsage } from "@/components/category-usage";

type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  icon?: string | null;
  parent_id?: string | null;
};

type Pair = { bg: string; fg: string };

/** Quantas categorias ficam à mostra antes do "Outras". */
const VISIBLE = 6;

function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Escolha da categoria sem ocupar a tela: as mais usadas em botões (um
 * toque), o resto em "Outras", com busca. A escolhida, se estiver entre
 * as outras, também aparece em botão pra ficar à vista.
 */
export function CategoryQuickPicker({
  categories,
  allCategories,
  direction,
  selectedTopId,
  colors,
  onSelect,
  onNewCategory,
}: {
  /** Só as principais do tipo certo (entrada ou saída). */
  categories: Category[];
  /** Todas, pra contar as subs. */
  allCategories: Category[];
  direction: "in" | "out";
  selectedTopId: string | null;
  colors: Map<string, Pair>;
  onSelect: (id: string) => void;
  onNewCategory: () => void;
}) {
  const usage = useCategoryUsage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Mais usadas primeiro; empate (ou nenhum uso ainda) em ordem alfabética.
  const ranked = useMemo(
    () =>
      [...categories].sort(
        (a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.name.localeCompare(b.name, "pt-BR"),
      ),
    [categories, usage],
  );
  // Com poucas categorias, mostra todas e dispensa o "Outras".
  const fitsAll = ranked.length <= VISIBLE + 2;
  const quick = fitsAll ? ranked : ranked.slice(0, VISIBLE);
  const rest = fitsAll ? [] : ranked.slice(VISIBLE).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const selectedInRest = rest.find((c) => c.id === selectedTopId) ?? null;
  const shown = selectedInRest ? [...quick, selectedInRest] : quick;

  const subCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of allCategories) if (c.parent_id) m.set(c.parent_id, (m.get(c.parent_id) ?? 0) + 1);
    return m;
  }, [allCategories]);

  const filtered = query.trim() ? rest.filter((c) => fold(c.name).includes(fold(query.trim()))) : rest;

  const colorOf = (c: Category) => themedPair(colors.get(c.name) ?? { bg: "#F2F4F7", fg: "#475467" });

  return (
    <div role="radiogroup" aria-label="Categoria" className="flex flex-wrap gap-1.5">
      {shown.map((c) => {
        const on = c.id === selectedTopId;
        const color = colorOf(c);
        const Icon = getCategoryIcon(c.name, direction, c.icon ?? null);
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(on ? "" : c.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] pr-3 pl-1.5 text-[13.5px] transition-colors ${
              on ? "font-semibold" : "border-(--border-primary) bg-(--bg-surface) font-medium text-(--text-body) hover:border-(--primary-border)"
            }`}
            style={on ? { borderColor: color.fg, backgroundColor: color.bg, color: color.fg } : undefined}
          >
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: color.bg, color: color.fg }}>
              <Icon className="h-3 w-3" strokeWidth={2.4} />
            </span>
            {c.name}
          </button>
        );
      })}

      {rest.length > 0 ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-full border-[1.5px] border-dashed border-(--primary-border) px-3 text-[13.5px] font-semibold text-(--primary) hover:bg-(--primary-soft) data-[state=open]:bg-(--primary-soft)"
            >
              Outras ({rest.length})
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-[min(300px,calc(100vw-32px))] p-2">
            <label className="flex h-10 items-center gap-2 rounded-[10px] bg-(--bg-subtle) px-3">
              <Search className="h-4 w-4 shrink-0 text-(--text-muted)" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar categoria…"
                aria-label="Buscar categoria"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filtered[0]) {
                      onSelect(filtered[0].id);
                      setOpen(false);
                    }
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-(--text-primary) outline-none placeholder:text-(--text-light)"
              />
            </label>
            <div className="mt-1 max-h-[260px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2.5 py-3 text-[13px] text-(--text-muted)">Nenhuma categoria com esse nome.</p>
              ) : (
                filtered.map((c) => {
                  const color = colorOf(c);
                  const Icon = getCategoryIcon(c.name, direction, c.icon ?? null);
                  const subs = subCount.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelect(c.id);
                        setOpen(false);
                      }}
                      className={`flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] text-(--text-primary) hover:bg-(--bg-hover) ${
                        c.id === selectedTopId ? "bg-(--primary-soft) font-semibold" : ""
                      }`}
                    >
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color.bg, color: color.fg }}>
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {subs > 0 ? <span className="text-[12px] text-(--text-light)">{subs === 1 ? "1 sub" : `${subs} subs`}</span> : null}
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNewCategory();
              }}
              className="mt-1 flex h-10 w-full items-center gap-2 rounded-[10px] border-t border-(--border-soft) px-2.5 text-[14px] font-semibold text-(--primary) hover:bg-(--primary-soft)"
            >
              <Plus className="h-4 w-4" />
              Nova categoria
            </button>
          </PopoverContent>
        </Popover>
      ) : (
        <button
          type="button"
          onClick={onNewCategory}
          className="inline-flex h-9 items-center gap-1 rounded-full border-[1.5px] border-dashed border-(--primary-border) px-3 text-[13.5px] font-semibold text-(--primary) hover:bg-(--primary-soft)"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova categoria
        </button>
      )}
    </div>
  );
}
