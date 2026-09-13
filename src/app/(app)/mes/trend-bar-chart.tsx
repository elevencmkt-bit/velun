"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "@/lib/money";

export type TrendPoint = { label: string; entrou_cents: number; saiu_cents: number };

export function TrendBarChart({
  points,
  compact = false,
}: {
  points: TrendPoint[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "h-36 w-full" : "h-64 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--ink)", opacity: 0.6 }}
            axisLine={{ stroke: "var(--rule)" }}
            tickLine={false}
          />
          {compact ? null : (
            <YAxis
              tickFormatter={(v: number) => formatCents(v)}
              tick={{ fontSize: 12, fill: "var(--ink)", opacity: 0.6 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
          )}
          <Tooltip
            formatter={(value, name) => [
              formatCents(Number(value)),
              name === "entrou_cents" ? "Entradas" : "Saídas",
            ]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          {compact ? null : (
            <Legend
              formatter={(value) => (value === "entrou_cents" ? "Entradas" : "Saídas")}
              wrapperStyle={{ fontSize: 13 }}
            />
          )}
          <Bar dataKey="entrou_cents" fill="var(--in)" radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar dataKey="saiu_cents" fill="var(--out)" radius={[4, 4, 0, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
