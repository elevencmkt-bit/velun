import Link from "next/link";
import { CalendarDays, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { buildCashFlowInsight, getCashFlowProjection } from "@/lib/cash-flow";
import { formatCents } from "@/lib/money";
import { ProjectionChart } from "./projection-chart";
import { ImpactsCard, InsightCard, UpcomingEventsCard } from "./support-cards";

const PERIODS = [
  { days: 30, label: "30 dias" },
  { days: 60, label: "60 dias" },
  { days: 90, label: "90 dias" },
  { days: 180, label: "6 meses" },
];
const DEFAULT_DAYS = 90;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const parsedDays = Number(period);
  const selectedPeriod =
    PERIODS.find((p) => p.days === parsedDays) ?? PERIODS.find((p) => p.days === DEFAULT_DAYS)!;
  const horizonDays = selectedPeriod.days;

  const { householdId, currency } = await getCurrentMember();
  const supabase = await createClient();

  const {
    points,
    currentTotal,
    lowestPoint,
    finalPoint,
    negativeDays,
    negativeDaysPct,
    totalIncome,
    totalExpense,
    netResult,
    upcomingEvents,
    highlightedEventIds,
  } = await getCashFlowProjection(supabase, householdId, horizonDays);

  const insight = buildCashFlowInsight({
    points,
    finalPoint,
    negativeDays,
    negativeDaysPct,
    upcomingEvents,
    periodLabel: selectedPeriod.label,
  });

  const today = new Date();
  const horizonDate = new Date();
  horizonDate.setDate(today.getDate() + horizonDays);
  const rangeLabel = `${dateFormatter.format(today)} – ${dateFormatter.format(horizonDate)}`;

  const kpis = [
    {
      key: "current",
      icon: WalletCards,
      iconBg: "var(--badge-blue-bg)",
      iconFg: "var(--badge-blue-fg)",
      label: "Saldo atual",
      value: formatCents(currentTotal, currency),
      valueColor: undefined as string | undefined,
      meta: null as string | null,
    },
    {
      key: "end",
      icon: TrendingUp,
      iconBg: finalPoint.balance_cents < 0 ? "var(--badge-red-bg)" : "var(--badge-green-bg)",
      iconFg: finalPoint.balance_cents < 0 ? "var(--badge-red-fg)" : "var(--badge-green-fg)",
      label: "Saldo ao final do período",
      value: formatCents(finalPoint.balance_cents, currency),
      valueColor: finalPoint.balance_cents < 0 ? "var(--expense)" : undefined,
      meta: `Após ${selectedPeriod.label}`,
    },
    {
      key: "low",
      icon: TrendingDown,
      iconBg: "var(--badge-red-bg)",
      iconFg: "var(--badge-red-fg)",
      label: "Menor saldo projetado",
      value: formatCents(lowestPoint.balance_cents, currency),
      valueColor: lowestPoint.balance_cents < 0 ? "var(--expense)" : undefined,
      meta: `em ${lowestPoint.label}`,
    },
    {
      key: "negative-days",
      icon: CalendarDays,
      iconBg: "var(--badge-purple-bg)",
      iconFg: "var(--badge-purple-fg)",
      label: "Dias no negativo",
      value: `${negativeDays} ${negativeDays === 1 ? "dia" : "dias"}`,
      valueColor: negativeDays > 0 ? "var(--expense)" : undefined,
      meta: negativeDays > 0 ? `${negativeDaysPct}% do período` : "Sem dias no negativo",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Fluxo de caixa</h1>
          <p className="text-page-subtitle max-w-[620px]">
            Acompanhe seu saldo atual, veja a projeção para os próximos meses e identifique os
            principais eventos da sua vida financeira.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex gap-0.5 rounded-[11px] border p-1"
            style={{ background: "var(--bg-subtle)", borderColor: "var(--border-primary)" }}
            role="tablist"
            aria-label="Período da projeção"
          >
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={p.days === DEFAULT_DAYS ? "/fluxo-de-caixa" : `/fluxo-de-caixa?period=${p.days}`}
                role="tab"
                aria-selected={p.days === horizonDays}
                className="rounded-[8px] px-4 py-[9px] text-[12px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                style={
                  p.days === horizonDays
                    ? {
                        color: "#fff",
                        background: "linear-gradient(135deg, #6475FF, #5162F5)",
                        boxShadow: "0 4px 12px rgba(91,108,255,.22)",
                      }
                    : { color: "var(--text-secondary)" }
                }
              >
                {p.label}
              </Link>
            ))}
          </div>
          <div
            className="flex h-11 items-center rounded-[10px] border px-3.5 text-[12px] font-medium text-(--text-secondary)"
            style={{ borderColor: "var(--border-primary)", background: "var(--bg-surface)" }}
          >
            {rangeLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.key}
            className="flex min-h-[116px] items-center gap-4 rounded-2xl border p-5 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: kpi.iconBg, color: kpi.iconFg }}
            >
              <kpi.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="mb-1 block text-[12px] font-semibold text-(--text-secondary)">{kpi.label}</span>
              <p
                className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.025em] tabular-nums"
                style={{ color: kpi.valueColor ?? "var(--text-primary)" }}
              >
                {kpi.value}
              </p>
              {kpi.meta ? <span className="mt-2 block text-[11px] text-(--text-light)">{kpi.meta}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div
        className="rounded-2xl border p-6 pb-4 shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h2 className="text-card-title">Evolução do saldo projetado</h2>
            <p className="text-[12px] text-(--text-secondary)">
              Saldo dia a dia considerando contas e lançamentos pendentes de {selectedPeriod.label}.
              {upcomingEvents.length === 0 ? " Nenhum lançamento futuro encontrado neste período." : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4 text-[11px] text-(--text-secondary)">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--income)" }} /> Saldo positivo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--expense)" }} /> Saldo negativo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "#6674FF" }} /> Entrada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "#F35D73" }} /> Saída
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[18px] border-t-[1.5px] border-dashed" style={{ borderColor: "#6E7B94" }} /> Zero
            </span>
          </div>
        </div>
        <ProjectionChart
          points={points}
          currency={currency}
          highlightedEventIds={[...highlightedEventIds]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
        <UpcomingEventsCard events={upcomingEvents} currency={currency} />
        <ImpactsCard
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          netResult={netResult}
          currency={currency}
          periodLabel={selectedPeriod.label}
        />
        <div className="lg:col-span-2 xl:col-span-1">
          <InsightCard insight={insight} />
        </div>
      </div>
    </div>
  );
}
