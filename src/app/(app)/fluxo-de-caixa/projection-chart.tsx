"use client";

import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { CashFlowPoint } from "@/lib/cash-flow";
import { Money } from "@/components/money";

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
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="mb-1 font-semibold text-(--text-primary) first-letter:uppercase">{dateLabel}</div>
      <div
        className="font-bold"
        style={{ color: point.balance_cents < 0 ? "var(--expense)" : "var(--income)" }}
      >
        <Money cents={point.balance_cents} currency={currency} />
      </div>
      {point.reference_cents !== undefined ? (
        <div className="text-[11px] text-(--text-muted)">
          Só o lançado: <Money cents={point.reference_cents} currency={currency} />
        </div>
      ) : null}
      {point.estimated_cents ? (
        <div className="text-[11px] text-(--text-muted)">
          Gasto estimado no dia: −<Money cents={point.estimated_cents} currency={currency} />
        </div>
      ) : null}
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
                <Money cents={event.amount_cents} currency={currency} />
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
  floorCents = 0,
}: {
  points: CashFlowPoint[];
  currency: CurrencyCode;
  highlightedEventIds: string[];
  /** Piso de segurança: linha amarela e faixa entre zero e ele. 0 = sem. */
  floorCents?: number;
}) {
  const min = Math.min(0, ...points.map((p) => Math.min(p.balance_cents, p.reference_cents ?? p.balance_cents)));
  const gradientId = useId();
  const stops = buildStrokeStops(points);
  const EventDot = makeEventDot(new Set(highlightedEventIds));

  return (
    <div className="h-[260px] w-full md:h-[330px]">
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
            stroke="#5B6CFF"
            strokeDasharray="6 6"
            label={{ value: "Hoje", position: "insideTopLeft", fill: "#5B6CFF", fontSize: 11, fontWeight: 600 }}
          />
          {floorCents > 0 ? (
            <ReferenceArea y1={0} y2={floorCents} fill="var(--warning-soft)" fillOpacity={0.9} ifOverflow="extendDomain" />
          ) : null}
          {min < 0 ? <ReferenceArea y1={min} y2={0} fill="var(--danger-soft)" fillOpacity={0.9} /> : null}
          <ReferenceLine y={0} stroke="var(--text-light)" strokeDasharray="5 5" strokeOpacity={0.8} />
          {floorCents > 0 ? (
            <ReferenceLine
              y={floorCents}
              stroke="var(--warning)"
              strokeDasharray="6 5"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{ value: "Piso", position: "insideTopRight", fill: "var(--warning-dark)", fontSize: 11, fontWeight: 700 }}
            />
          ) : null}
          {points.some((p) => p.reference_cents !== undefined) ? (
            <Line
              type="basis"
              dataKey="reference_cents"
              stroke="var(--text-light)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null}
          <Line
            type="basis"
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
