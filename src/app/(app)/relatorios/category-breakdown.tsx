"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { CurrencyCode } from "@/lib/money";
import { Money } from "@/components/money";
import { CategoryDrawer, type CategoryDrawerQuery } from "@/components/category-drawer";

export type BreakdownRow = {
  name: string;
  amount_cents: number;
  /** Valor no mês anterior; null = a categoria não existia. */
  prev_cents: number | null;
  color: string;
};

const MOBILE_LIMIT = 5;

function Delta({
  row,
  kind,
  currency,
}: {
  row: BreakdownRow;
  kind: "expense" | "income";
  currency: CurrencyCode;
}) {
  if (row.prev_cents === null) return <span className="text-(--primary)">novo</span>;
  const d = row.amount_cents - row.prev_cents;
  if (d === 0) return <span className="text-(--text-light)">igual</span>;
  // Gasto que sobe é ruim; receita que sobe é boa.
  const good = kind === "expense" ? d < 0 : d > 0;
  return (
    <span style={{ color: good ? "var(--income-dark)" : "var(--expense-dark)" }}>
      {d > 0 ? "+" : "−"}
      <Money cents={Math.abs(d)} currency={currency} />
    </span>
  );
}

/** Rosca + lista com barra e variação contra o mês anterior, com abas Despesas/Receitas. */
export function CategoryBreakdown({
  expense,
  income,
  prevLabel,
  currency,
  emptyExpense,
  emptyIncome,
  month,
  status,
}: {
  expense: BreakdownRow[];
  income: BreakdownRow[];
  /** "agosto" */
  prevLabel: string;
  currency: CurrencyCode;
  emptyExpense: string;
  emptyIncome: string;
  /** "2026-09": o painel da categoria busca os lançamentos desse mês. */
  month: string;
  status: "cleared" | "pending";
}) {
  const [drawer, setDrawer] = useState<CategoryDrawerQuery | null>(null);
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [showAll, setShowAll] = useState(false);
  const rows = tab === "expense" ? expense : income;
  const total = rows.reduce((n, r) => n + r.amount_cents, 0);
  const max = rows[0]?.amount_cents ?? 1;
  const openCategory = (r: BreakdownRow) =>
    setDrawer({ month, name: r.name, direction: tab === "income" ? "in" : "out", status, color: r.color });

  const tabClass = (on: boolean) =>
    `flex h-9 flex-1 items-center justify-center rounded-[10px] px-4 text-[13px] font-semibold transition-colors sm:flex-none ${
      on ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.08)]" : "text-(--text-muted)"
    }`;

  return (
    <section className="rounded-[20px] bg-(--bg-surface) p-4 shadow-(--shadow-card) md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-card-title max-sm:hidden">Por categoria</h2>
        <div role="tablist" className="flex gap-1 rounded-[13px] bg-[#F4F5F8] p-1">
          <button type="button" role="tab" aria-selected={tab === "expense"} className={tabClass(tab === "expense")} onClick={() => { setTab("expense"); setShowAll(false); }}>
            Despesas
          </button>
          <button type="button" role="tab" aria-selected={tab === "income"} className={tabClass(tab === "income")} onClick={() => { setTab("income"); setShowAll(false); }}>
            Receitas
          </button>
        </div>
      </div>

      {rows.length === 0 || total === 0 ? (
        <p className="mt-5 text-sm text-(--text-muted)">{tab === "expense" ? emptyExpense : emptyIncome}</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 items-center gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
          <div className="relative mx-auto h-[170px] w-[170px] md:h-[200px] md:w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount_cents"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={rows.length > 1 ? 1.5 : 0}
                  stroke="none"
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(_, index) => {
                    const r = rows[index];
                    if (r) openCategory(r);
                  }}
                >
                  {rows.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[17px] font-bold tabular-nums text-(--text-primary) md:text-[20px]">
                <Money cents={total} currency={currency} />
              </span>
              <span className="text-xs text-(--text-muted)">{tab === "expense" ? "saiu" : "entrou"}</span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_76px] items-center gap-3 pb-1 text-[11px] font-bold tracking-[0.04em] text-(--text-light) uppercase md:grid-cols-[minmax(0,150px)_minmax(0,1fr)_96px_110px]">
              <span>Categoria</span>
              <span className="max-md:hidden" />
              <span className="text-right">Valor</span>
              <span className="text-right">vs {prevLabel}</span>
            </div>
            {rows.map((r, i) => (
              <button
                type="button"
                key={r.name}
                onClick={() => openCategory(r)}
                aria-label={`Ver lançamentos de ${r.name}`}
                className={`-mx-2 grid min-h-[44px] w-[calc(100%+16px)] grid-cols-[minmax(0,1fr)_auto_76px] items-center gap-3 rounded-[10px] border-b border-(--border-soft) px-2 text-left transition-colors last:border-0 hover:bg-[#F5F6FF] md:grid-cols-[minmax(0,150px)_minmax(0,1fr)_96px_110px] md:border-0 ${
                  !showAll && i >= MOBILE_LIMIT ? "max-md:hidden" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-(--text-primary)">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-[#F2F4F7] max-md:hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(2, Math.round((r.amount_cents / max) * 100))}%`, background: r.color }}
                  />
                </span>
                <span className="text-right text-sm font-bold tabular-nums text-(--text-primary)">
                  <Money cents={r.amount_cents} currency={currency} />
                </span>
                <span className="text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                  <Delta row={r} kind={tab} currency={currency} />
                </span>
              </button>
            ))}
            {rows.length > MOBILE_LIMIT && !showAll ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 w-full text-center text-[13px] font-semibold text-(--primary) md:hidden"
              >
                Ver as {rows.length} categorias
              </button>
            ) : null}
          </div>
        </div>
      )}
      <CategoryDrawer query={drawer} onClose={() => setDrawer(null)} currency={currency} />
    </section>
  );
}
