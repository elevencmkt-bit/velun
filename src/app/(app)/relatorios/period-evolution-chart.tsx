"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { DailyReportPoint } from "@/lib/reports";
import { Money } from "@/components/money";

type ChartPoint = DailyReportPoint & { cumulative_cents: number };

function withCumulative(points: DailyReportPoint[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  let running = 0;
  for (const p of points) {
    running += p.net_cents;
    out.push({ ...p, cumulative_cents: running });
  }
  return out;
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
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
      <div className="mb-1.5 font-semibold text-(--text-primary) first-letter:uppercase">{dateLabel}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Receitas</span>
          <span className="font-semibold tabular-nums" style={{ color: "#22C55E" }}>
            <Money cents={point.income_cents} currency={currency} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Despesas</span>
          <span className="font-semibold tabular-nums" style={{ color: "#F04469" }}>
            <Money cents={point.expense_cents} currency={currency} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--text-secondary)">Acumulado no mês</span>
          <span className="font-semibold tabular-nums" style={{ color: "#3B82F6" }}>
            <Money cents={point.cumulative_cents} currency={currency} />
          </span>
        </div>
      </div>
    </div>
  );
}

// Barras pra receitas e despesas de cada dia, e uma linha curva pro
// saldo acumulado no mês. A curva é "basis": arredonda os degraus mas
// fica sempre entre os valores de verdade — nunca inventa um vale abaixo
// do menor saldo nem um pico acima do maior, que era o defeito das curvas
// antigas.
export function PeriodEvolutionChart({
  points,
  currency,
}: {
  points: DailyReportPoint[];
  currency: CurrencyCode;
}) {
  const data = withCumulative(points);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={1} barCategoryGap="20%">
          <CartesianGrid stroke="#EEF1F5" vertical={false} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={8}
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
          <ReferenceLine y={0} stroke="#D5DAE3" />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "rgba(83,109,254,0.06)" }} />
          <Bar dataKey="income_cents" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Bar dataKey="expense_cents" fill="#F04469" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Line
            type="basis"
            dataKey="cumulative_cents"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
