"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createCategory } from "@/lib/actions/categories";

type Cat = { id: string; name: string; kind: "income" | "expense"; parent_id?: string | null; is_transfer?: boolean };

/**
 * Segunda fileira do seletor de categoria: aparece quando a categoria
 * escolhida tem subcategorias (ou pra criar a primeira). Escolher a sub é
 * opcional — tocar de novo na sub volta pra só a categoria.
 */
export function SubcategoryChips({
  parent,
  categories,
  value,
  onChange,
  onCreated,
  color,
}: {
  /** A categoria principal escolhida. */
  parent: Cat;
  categories: Cat[];
  /** id escolhido: a principal ou uma sub dela. */
  value: string;
  onChange: (id: string) => void;
  /** Sub nova criada aqui: entra na lista de quem chamou. */
  onCreated: (cat: Cat) => void;
  color: { fg: string; bg: string };
}) {
  const subs = categories.filter((c) => c.parent_id === parent.id);
  // Movimentação entre contas (Transferência) não tem subcategoria: fica
  // fora de receita e despesa, então não há relatório pra ela somar.
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", trimmed);
    fd.set("kind", parent.kind);
    fd.set("parent_id", parent.id);
    startTransition(async () => {
      try {
        const res = await createCategory(fd);
        if (!res.ok) throw new Error(res.error);
        const id = res.id;
        onCreated({ id, name: trimmed, kind: parent.kind, parent_id: parent.id });
        onChange(id);
        setName("");
        setAdding(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não consegui criar.");
      }
    });
  }

  if (parent.is_transfer) return null;

  if (subs.length === 0 && !adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="self-start text-[13px] font-semibold text-(--primary) hover:underline"
      >
        + Subcategoria em {parent.name}
      </button>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[16px] px-3.5 py-3"
      style={{ backgroundColor: `color-mix(in srgb, ${color.fg} 7%, var(--bg-surface))` }}
    >
      <span className="mr-0.5 text-[12px] font-semibold" style={{ color: color.fg }}>
        {parent.name} ›
      </span>
      {subs.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? parent.id : s.id)}
            className={`inline-flex h-[34px] items-center rounded-full border-[1.5px] px-3 text-[13px] transition-colors ${
              on ? "font-semibold text-white" : "border-(--border-primary) bg-(--bg-surface) font-medium text-(--text-secondary) hover:border-(--primary-border)"
            }`}
            style={on ? { borderColor: color.fg, backgroundColor: color.fg } : undefined}
          >
            {s.name}
          </button>
        );
      })}
      {adding ? (
        <span className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Nome da sub"
            aria-label="Nome da subcategoria"
            className="h-[34px] w-36 rounded-full border-[1.5px] border-(--primary-border) bg-(--bg-surface) px-3 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={create}
            disabled={isPending}
            className="h-[34px] rounded-full bg-(--primary) px-3 text-[13px] font-semibold text-white"
          >
            Criar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-[34px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-(--primary-border) px-3 text-[13px] font-semibold text-(--primary)"
        >
          <Plus className="h-3.5 w-3.5" /> nova
        </button>
      )}
      {error ? <span className="w-full text-[12px] text-(--expense-dark)">{error}</span> : null}
    </div>
  );
}
