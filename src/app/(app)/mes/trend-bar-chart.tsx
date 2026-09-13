"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents, type CurrencyCode } from "@/lib/money";

export type TrendPoint = { label: string; entrou_cents: number; saiu_cents: number };

export function TrendBarChart({
  points,
  compact = false,
  currency = "USD",
}: {
  points: TrendPoint[];
  compact?: boolean;
  currency?: CurrencyCode;
}) {
  return (
    <div className={compact ? "h-56 w-full" : "h-72 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 0, right: 8, bottom: 0, left: compact ? 0 : 8 }}
          barCategoryGap={compact ? "20%" : "30%"}
          barGap={4}
        >
          <CartesianGrid vertical={false} stroke="var(--border-soft)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--border-primary)" }}
            tickLine={false}
          />
          {compact ? null : (
            <YAxis
              tickFormatter={(v: number) => formatCents(v, currency)}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
          )}
          <Tooltip
            cursor={{ fill: "var(--border-soft)" }}
            formatter={(value, name) => [
              formatCents(Number(value), currency),
              name === "entrou_cents" ? "Entradas" : "Saídas",
            ]}
            contentStyle={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              borderRadius: 8,
              boxShadow: "0 4px 14px rgba(16,24,40,.08)",
              fontSize: 13,
              padding: "8px 12px",
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            formatter={(value) => (value === "entrou_cents" ? "Entradas" : "Saídas")}
            wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
          />
          <Bar dataKey="entrou_cents" fill="var(--chart-green)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="saiu_cents" fill="var(--chart-red)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
