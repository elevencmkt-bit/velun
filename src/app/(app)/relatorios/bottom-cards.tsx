"use client";

import { useState } from "react";
import { Check, Info, Lightbulb, TrendingDown } from "lucide-react";
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { CategorySlice, ReportInsight } from "@/lib/reports";

const RANK_GRADIENTS = [
  "linear-gradient(90deg, #FF6B81, #F04469)",
  "linear-gradient(90deg, #FFB347, #FF8A1F)",
  "linear-gradient(90deg, #FACC15, #F59E0B)",
  "linear-gradient(90deg, #34D399, #10B981)",
  "linear-gradient(90deg, #5B6CFF, #3B82F6)",
];

const MAX_RANK_ROWS = 5;

export function TopCategoriesCard({
  expenseRanking,
  incomeRanking,
  totalExpense,
  totalIncome,
  currency,
}: {
  expenseRanking: CategorySlice[];
  incomeRanking: CategorySlice[];
  totalExpense: number;
  totalIncome: number;
  currency: CurrencyCode;
}) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const ranking = (kind === "expense" ? expenseRanking : incomeRanking).slice(0, MAX_RANK_ROWS);
  const total = kind === "expense" ? totalExpense : totalIncome;
  const maxAmount = ranking[0]?.amount_cents ?? 0;

  return (
    <article
      className="flex flex-col rounded-2xl border p-5"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-extrabold text-(--text-primary)">Top categorias</h3>
          <p className="text-[12px] text-(--text-secondary)">As categorias que mais impactaram seu período.</p>
        </div>
        <div className="inline-flex shrink-0 gap-0.5 rounded-full border p-[3px]" style={{ background: "#F2F4F8", borderColor: "#E8ECF4" }}>
          {(["expense", "income"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className="h-8 rounded-full px-3.5 text-[12px] font-semibold transition-colors"
              style={
                kind === value
                  ? { background: "#FFFFFF", color: "var(--text-primary)", boxShadow: "0 2px 6px rgba(16,24,40,.05)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {value === "expense" ? "Despesas" : "Receitas"}
            </button>
          ))}
        </div>
      </div>

      {ranking.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">
          Nenhuma {kind === "expense" ? "despesa" : "receita"} neste período.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          {ranking.map((row, i) => {
            const percent = total > 0 ? Math.round((row.amount_cents / total) * 100) : 0;
            const barWidth = maxAmount > 0 ? Math.round((row.amount_cents / maxAmount) * 100) : 0;
            return (
              <div
                key={row.name}
                className="grid grid-cols-[28px_1fr_auto] items-center gap-3 sm:grid-cols-[28px_minmax(0,1fr)_170px_auto_44px]"
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: "#EEF2F8", color: "var(--text-secondary)" }}
                >
                  {i + 1}
                </div>
                <span className="truncate text-[13px] font-semibold text-(--text-primary)">{row.name}</span>
                <div className="col-span-3 h-[10px] overflow-hidden rounded-full sm:col-span-1" style={{ background: "#EEF1F6" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${barWidth}%`, background: RANK_GRADIENTS[i % RANK_GRADIENTS.length] }}
                  />
                </div>
                <span className="text-right text-[13px] font-semibold tabular-nums text-(--text-secondary)">
                  {formatCents(row.amount_cents, currency)}
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-(--text-secondary)">
                  {percent}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

const INSIGHT_BULLET_STYLE: Record<ReportInsight["items"][number]["tone"], { bg: string; fg: string }> = {
  positive: { bg: "#EAFBF2", fg: "#16A34A" },
  warning: { bg: "#FFF4E5", fg: "#F59E0B" },
  info: { bg: "#EEF4FF", fg: "#3B82F6" },
};

export function InsightVelunCard({ insight }: { insight: ReportInsight }) {
  return (
    <article
      className="flex flex-col rounded-2xl border p-5"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      <div className="mb-1 flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          <Lightbulb className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-[16px] font-extrabold text-(--text-primary)">Insight Velun</h3>
          <p className="text-[12px] text-(--text-secondary)">Análises inteligentes para suas finanças.</p>
        </div>
      </div>

      <div
        className="mt-3 flex gap-3 rounded-[14px] border p-3.5"
        style={{ background: "linear-gradient(135deg, #ECFBF3 0%, #F2FCF7 100%)", borderColor: "#DFF6EA" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(255,255,255,.78)", color: "#16A34A" }}
        >
          <Check className="h-4 w-4" style={{ color: insight.tone === "warning" ? "#F59E0B" : "#16A34A" }} />
        </div>
        <p className="text-[12px] leading-[1.45] font-semibold" style={{ color: "#1D7A46" }}>
          {insight.headline}
        </p>
      </div>

      {insight.items.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {insight.items.map((item, i) => {
            const style = INSIGHT_BULLET_STYLE[item.tone];
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: style.bg, color: style.fg }}
                >
                  {item.tone === "warning" ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : item.tone === "info" ? (
                    <Info className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </div>
                <p className="text-[12px] leading-[1.4] text-(--text-secondary)">{item.text}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
