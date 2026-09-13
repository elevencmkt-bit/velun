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

function EndDot(props: { cx?: number; cy?: number; index?: number; totalPoints: number }) {
  const { cx, cy, index, totalPoints } = props;
  if (cx === undefined || cy === undefined || index !== totalPoints - 1) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--chart-blue)" stroke="white" strokeWidth={2} />;
}

export function CashFlowChart({
  points,
  compact = false,
}: {
  points: CashFlowPoint[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "h-44 w-full" : "h-80 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={compact ? { top: 8, right: 12, bottom: 0, left: 4 } : { top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border-soft)" />
          <XAxis
            dataKey="label"
            interval={compact ? points.length - 2 : 6}
            tick={{ fontSize: compact ? 11 : 11, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--border-primary)" }}
            tickLine={false}
          />
          {compact ? null : (
            <YAxis
              tickFormatter={(v: number) => formatCents(v)}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
          )}
          <Tooltip
            formatter={(value) => [formatCents(Number(value)), "Saldo projetado"]}
            labelFormatter={compact ? (label) => label : undefined}
            contentStyle={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              borderRadius: 8,
              boxShadow: "0 4px 14px rgba(16,24,40,.08)",
              fontSize: 13,
              padding: "8px 12px",
            }}
          />
          {compact ? null : (
            <ReferenceLine x={points[0]?.label} stroke="var(--border-primary)" strokeDasharray="3 3" />
          )}
          <ReferenceLine y={0} stroke="var(--chart-red)" strokeDasharray="3 3" />
          <Line
            type="stepAfter"
            dataKey="balance_cents"
            stroke="var(--chart-blue)"
            strokeWidth={2}
            dot={compact ? <EndDot totalPoints={points.length} /> : false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
