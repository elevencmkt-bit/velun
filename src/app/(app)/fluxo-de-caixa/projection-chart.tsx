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

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: CashFlowPoint;
};

function makeEventDot(highlightedEventIds: Set<string>) {
  return function EventDot({ cx, cy, payload }: DotProps) {
    if (cx === undefined || cy === undefined || !payload) return null;
    const highlighted = payload.events.find((e) => highlightedEventIds.has(e.id));
    if (!highlighted) return null;
    const isIncome = highlighted.type === "income";
    const color = isIncome ? "var(--income)" : "var(--expense)";
    return (
      <g>
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
        <text
          x={cx}
          y={isIncome ? cy - 12 : cy + 20}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={color}
        >
          {truncate(highlighted.label, 14)}
        </text>
      </g>
    );
  };
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: CashFlowPoint }[];
  currency: CurrencyCode;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const dateLabel = new Date(`${point.date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="min-w-[190px] rounded-lg border p-3 text-xs shadow-lg"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-primary)",
        boxShadow: "0 4px 14px rgba(16,24,40,.08)",
      }}
    >
      <div className="mb-1 font-semibold text-(--text-primary) capitalize">{dateLabel}</div>
      <div
        className="font-bold"
        style={{ color: point.balance_cents < 0 ? "var(--expense)" : "var(--income)" }}
      >
        {formatCents(point.balance_cents, currency)}
      </div>
      {point.events.length > 0 ? (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-(--border-soft) pt-1.5">
          {point.events.map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-3">
              <span className="text-(--text-secondary)">{event.label}</span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: event.type === "income" ? "var(--income)" : "var(--expense)" }}
              >
                {event.type === "income" ? "+" : ""}
                {formatCents(event.amount_cents, currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectionChart({
  points,
  currency,
  highlightedEventIds,
}: {
  points: CashFlowPoint[];
  currency: CurrencyCode;
  highlightedEventIds: string[];
}) {
  const gradientId = useId();
  const stops = buildStrokeStops(points);
  const EventDot = makeEventDot(new Set(highlightedEventIds));

  return (
    <div className="h-[330px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 24, right: 16, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              {stops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-soft)" />
          <XAxis
            dataKey="label"
            interval={Math.max(Math.ceil(points.length / 10), 1)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--border-primary)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCents(v, currency)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={84}
          />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <ReferenceLine
            x={points[0]?.label}
            stroke="var(--primary)"
            strokeDasharray="4 3"
            label={{ value: "Hoje", position: "insideTopLeft", fill: "var(--primary)", fontSize: 11, fontWeight: 600 }}
          />
          <ReferenceLine y={0} stroke="#98A2B3" strokeDasharray="3 3" />
          <Line
            type="stepAfter"
            dataKey="balance_cents"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            dot={EventDot}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
