"use client";

import { useState } from "react";
import { Money } from "@/components/money";
import { CategoryDrawer, type CategoryDrawerQuery } from "@/components/category-drawer";
import type { CurrencyCode } from "@/lib/money";

// "Para onde foi" do Dashboard. Cada categoria abre o painel com os
// lançamentos dela no mês; "Categorizar" abre o de "Sem categoria".
export function WhereList({
  where,
  colors,
  uncategorized,
  month,
  currency,
}: {
  where: { name: string; amount_cents: number }[];
  colors: string[];
  uncategorized: number;
  /** "2026-09" */
  month: string;
  currency: CurrencyCode;
}) {
  const [drawer, setDrawer] = useState<CategoryDrawerQuery | null>(null);
  const max = where[0]?.amount_cents ?? 1;
  const open = (name: string, color?: string) =>
    setDrawer({ month, name, direction: "out", status: "cleared", color });

  return (
    <>
      {where.map((slice, i) => {
        const color = colors[i % colors.length];
        return (
          <button
            type="button"
            key={slice.name}
            onClick={() => open(slice.name, color)}
            aria-label={`Ver lançamentos de ${slice.name}`}
            className="-mx-2 rounded-[10px] px-2 py-1 text-left transition-colors hover:bg-[#F5F6FF]"
          >
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="truncate">{slice.name}</span>
              <span className="font-semibold tabular-nums">
                <Money cents={slice.amount_cents} currency={currency} />
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-(--bg-subtle)">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(4, (slice.amount_cents / max) * 100)}%`, background: color }}
              />
            </div>
          </button>
        );
      })}
      {uncategorized > 0 ? (
        <div className="rounded-xl bg-(--bg-subtle) px-3 py-2.5 text-xs leading-relaxed text-(--text-muted)">
          <Money cents={uncategorized} currency={currency} /> sem categoria.{" "}
          <button
            type="button"
            onClick={() => open("Sem categoria")}
            className="font-semibold text-(--primary) hover:text-(--primary-hover)"
          >
            Categorizar
          </button>
        </div>
      ) : null}
      <CategoryDrawer query={drawer} onClose={() => setDrawer(null)} currency={currency} />
    </>
  );
}
