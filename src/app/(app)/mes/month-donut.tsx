"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCents } from "@/lib/money";

export type DonutSlice = { name: string; amount_cents: number; color: string };

export function MonthDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.amount_cents, 0);

  if (slices.length === 0 || total === 0) {
    return <p className="text-sm text-[--ink]/70">Nenhuma despesa cleared neste mês.</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative h-56 w-56 shrink-0">
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
              formatter={(value, name) => [formatCents(Number(value)), String(name)]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--rule)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{formatCents(total)}</span>
          <span className="text-xs text-[--ink]/50">Total</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5">
        {slices.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 truncate">{slice.name}</span>
            <span className="text-[--ink]/60">{Math.round((slice.amount_cents / total) * 100)}%</span>
            <span className="w-20 text-right font-medium tabular-nums">
              {formatCents(slice.amount_cents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
