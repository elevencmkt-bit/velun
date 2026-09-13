"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import type { CashFlowPoint } from "@/lib/cash-flow";

export function CashFlowChart({
  points,
  compact = false,
}: {
  points: CashFlowPoint[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "h-32 w-full" : "h-80 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={compact ? { top: 4, right: 4, bottom: 0, left: 4 } : { top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          {compact ? null : (
            <XAxis
              dataKey="label"
              interval={6}
              tick={{ fontSize: 12, fill: "var(--ink)", opacity: 0.6 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
            />
          )}
          {compact ? null : (
            <YAxis
              tickFormatter={(v: number) => formatCents(v)}
              tick={{ fontSize: 12, fill: "var(--ink)", opacity: 0.6 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
          )}
          <Tooltip
            formatter={(value) => [formatCents(Number(value)), "Saldo projetado"]}
            labelFormatter={compact ? (label) => label : undefined}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          {compact ? null : (
            <ReferenceLine x={points[0]?.label} stroke="var(--rule)" strokeDasharray="3 3" />
          )}
          <ReferenceLine y={0} stroke="var(--out)" strokeDasharray="3 3" />
          <Line
            type="stepAfter"
            dataKey="balance_cents"
            stroke="#2a78d6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
