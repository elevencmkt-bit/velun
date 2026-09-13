"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { DailyReportPoint } from "@/lib/reports";

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: DailyReportPoint }[];
  currency: CurrencyCode;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const dateLabel = new Date(`${point.date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });

  return (
    <div
      className="min-w-[170px] rounded-lg border p-3 text-xs shadow-lg"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 4px 14px rgba(16,24,40,.08)" }}
    >
      <div className="mb-1.5 font-semibold text-(--text-primary) capitalize">{dateLabel}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Receitas</span>
          <span className="font-semibold tabular-nums" style={{ color: "#22C55E" }}>
            {formatCents(point.income_cents, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Despesas</span>
          <span className="font-semibold tabular-nums" style={{ color: "#F04469" }}>
            {formatCents(point.expense_cents, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Saldo</span>
          <span className="font-semibold tabular-nums" style={{ color: "#3B82F6" }}>
            {formatCents(point.net_cents, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PeriodEvolutionChart({
  points,
  currency,
}: {
  points: DailyReportPoint[];
  currency: CurrencyCode;
}) {
  const incomeGradientId = useId();
  const expenseGradientId = useId();
  const netGradientId = useId();

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={incomeGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F04469" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#F04469" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={netGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#EEF1F5" vertical={false} />
          <XAxis
            dataKey="label"
            interval={1}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "#E8ECF4" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCents(v, currency)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="income_cents"
            stroke="#22C55E"
            strokeWidth={2}
            fill={`url(#${incomeGradientId})`}
            dot={false}
            activeDot={{ r: 3.5 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="expense_cents"
            stroke="#F04469"
            strokeWidth={2}
            fill={`url(#${expenseGradientId})`}
            dot={false}
            activeDot={{ r: 3.5 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="net_cents"
            stroke="#3B82F6"
            strokeWidth={2}
            fill={`url(#${netGradientId})`}
            dot={false}
            activeDot={{ r: 3.5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
