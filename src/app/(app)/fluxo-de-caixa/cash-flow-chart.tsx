"use client";

import { useId } from "react";
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
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { CashFlowPoint } from "@/lib/cash-flow";

function EndDot(props: { cx?: number; cy?: number; index?: number; totalPoints: number; color: string }) {
  const { cx, cy, index, totalPoints, color } = props;
  if (cx === undefined || cy === undefined || index !== totalPoints - 1) return null;
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={2} />;
}

function colorFor(balanceCents: number) {
  return balanceCents >= 0 ? "var(--income)" : "var(--expense)";
}

// A linha do saldo projetado precisa ficar verde acima de zero e
// vermelha abaixo — como é um único <Line>, a única forma de variar a
// cor ao longo do traçado é um gradiente com stops "duros" (dois stops
// no mesmo offset) exatamente onde o saldo cruza de sinal.
function buildStrokeStops(points: CashFlowPoint[]) {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ offset: "0%", color: colorFor(points[0].balance_cents) }];

  const stops: { offset: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const offset = `${(i / (n - 1)) * 100}%`;
    if (i > 0) stops.push({ offset, color: colorFor(points[i - 1].balance_cents) });
    stops.push({ offset, color: colorFor(points[i].balance_cents) });
  }
  return stops;
}

export function CashFlowChart({
  points,
  compact = false,
  currency = "USD",
}: {
  points: CashFlowPoint[];
  compact?: boolean;
  currency?: CurrencyCode;
}) {
  const gradientId = useId();
  const stops = buildStrokeStops(points);
  const lastColor = points.length > 0 ? colorFor(points[points.length - 1].balance_cents) : "var(--income)";

  return (
    <div className={compact ? "h-44 w-full" : "h-80 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={compact ? { top: 8, right: 12, bottom: 0, left: 4 } : { top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              {stops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
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
              tickFormatter={(v: number) => formatCents(v, currency)}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
          )}
          <Tooltip
            formatter={(value) => [formatCents(Number(value), currency), "Saldo projetado"]}
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
          <ReferenceLine y={0} stroke="var(--border-primary)" strokeDasharray="3 3" />
          <Line
            type="stepAfter"
            dataKey="balance_cents"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            dot={compact ? <EndDot totalPoints={points.length} color={lastColor} /> : false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
