"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCents, type CurrencyCode } from "@/lib/money";

export type DonutSlice = { name: string; amount_cents: number; color: string };

export function MonthDonut({
  slices,
  compact = false,
  currency = "USD",
}: {
  slices: DonutSlice[];
  compact?: boolean;
  currency?: CurrencyCode;
}) {
  const total = slices.reduce((sum, s) => sum + s.amount_cents, 0);

  if (slices.length === 0 || total === 0) {
    return <p className="text-sm text-(--text-muted)">Nenhuma despesa cleared neste mês.</p>;
  }

  const size = compact ? "h-36 w-36" : "h-56 w-56";

  return (
    <div className={compact ? "flex flex-col items-center gap-4" : "flex flex-col gap-4 sm:flex-row sm:items-center"}>
      <div className={`relative ${size} shrink-0`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount_cents"
              nameKey="name"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatCents(Number(value), currency), String(name)]}
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold tabular-nums text-(--text-primary)"
            style={{ fontSize: compact ? 13 : 16 }}
          >
            {formatCents(total, currency)}
          </span>
          <span className="text-[11px] text-(--text-muted)">Total</span>
        </div>
      </div>
      <ul className="flex w-full flex-1 flex-col gap-1.5">
        {slices.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 truncate text-(--text-secondary)">{slice.name}</span>
            {compact ? null : (
              <span className="text-(--text-muted)">
                {Math.round((slice.amount_cents / total) * 100)}%
              </span>
            )}
            <span className="w-20 text-right font-semibold tabular-nums text-(--text-primary)">
              {formatCents(slice.amount_cents, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
