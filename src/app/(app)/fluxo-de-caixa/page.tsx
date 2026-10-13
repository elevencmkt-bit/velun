import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { addDaysISO } from "@/lib/today";
import { buildCashFlowNote, getCashFlowProjection } from "@/lib/cash-flow";
import { accountScope } from "@/lib/visibility";
import { formatCents } from "@/lib/money";
import { ProjectionChart } from "./projection-chart";
import { PeriodSummaryCard, UpcomingEventsCard } from "./support-cards";
import { Money } from "@/components/money";

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
  searchParams: Promise<{ period?: string; atrasados?: string }>;
}) {
  const { period, atrasados } = await searchParams;
  const parsedDays = Number(period);
  const selectedPeriod =
    PERIODS.find((p) => p.days === parsedDays) ?? PERIODS.find((p) => p.days === DEFAULT_DAYS)!;
  const horizonDays = selectedPeriod.days;
  const includeOverdue = atrasados === "1";

  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();

  const {
    points,
    overdue,
    withOverdue,
    currentTotal,
    lowestPoint,
    finalPoint,
    negativeDays,
    totalIncome,
    totalExpense,
    netResult,
    upcomingEvents,
    highlightedEventIds,
  } = await getCashFlowProjection(
    supabase,
    householdId,
    horizonDays,
    await accountScope(supabase, householdId, memberId, "balance"),
    today,
    { includeOverdue },
  );

  const fmt = (cents: number) => formatCents(cents, currency);
  const note = buildCashFlowNote({
    points,
    upcomingEvents,
    formatMoney: fmt,
    value: withOverdue ? (p) => p.with_overdue_cents ?? p.balance_cents : undefined,
  });

  const href = (next: { period?: number; atrasados?: boolean }) => {
    const q = new URLSearchParams();
    const days = next.period ?? horizonDays;
    if (days !== DEFAULT_DAYS) q.set("period", String(days));
    if (next.atrasados ?? includeOverdue) q.set("atrasados", "1");
    const qs = q.toString();
    return `/fluxo-de-caixa${qs ? `?${qs}` : ""}`;
  };

  const todayDate = new Date(`${today}T12:00:00`);
  const horizonDate = new Date(`${addDaysISO(today, horizonDays)}T12:00:00`);
  const rangeLabel = `${dateFormatter.format(todayDate)} – ${dateFormatter.format(horizonDate)}`;

  const endCents = withOverdue ? withOverdue.finalCents : finalPoint.balance_cents;
  const lowCents = withOverdue ? withOverdue.lowestCents : lowestPoint.balance_cents;
  const lowDate = withOverdue ? withOverdue.lowestPoint.date : lowestPoint.date;
  const negDays = withOverdue ? withOverdue.negativeDays : negativeDays;
  const lowWhen =
    lowDate === today
      ? "hoje"
      : new Date(`${lowDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  const signed = (cents: number) => (
    <>
      {cents < 0 ? "−" : ""}
      <Money cents={Math.abs(cents)} currency={currency} />
    </>
  );

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title">Fluxo de caixa</h1>
        <p className="text-page-subtitle max-sm:hidden">
          Quanto vai ter na conta nos próximos dias, com o que já está previsto.
        </p>
      </div>

      {overdue.count > 0 ? (
        <div className="flex flex-col gap-3 rounded-[16px] bg-(--danger-soft) px-4 py-3.5 md:flex-row md:items-center md:gap-4 md:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-(--danger-text)" />
            <p className="text-sm leading-relaxed text-(--danger-ink)">
              <b>
                {overdue.count} {overdue.count === 1 ? "lançamento atrasado" : "lançamentos atrasados"} (
                {signed(overdue.netOutCents)})
              </b>{" "}
              {includeOverdue
                ? "estão na projeção como se saíssem hoje. A linha tracejada mostra o efeito."
                : "ficaram fora da projeção. Se ainda vão sair da conta, o saldo real será menor."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-md:pl-8">
            <Link
              href={href({ atrasados: !includeOverdue })}
              className={`flex h-9 items-center rounded-[11px] px-3.5 text-[13px] font-semibold whitespace-nowrap ${
                includeOverdue ? "bg-(--bg-surface) text-(--danger-text)" : "bg-[#B42318] text-white"
              }`}
            >
              {includeOverdue ? "Tirar da projeção" : "Incluir na projeção"}
            </Link>
            <Link
              href="/transacoes?status=late"
              className="flex h-9 items-center px-2 text-[13px] font-semibold whitespace-nowrap text-(--danger-text)"
            >
              Ver em Transações →
            </Link>
          </div>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[24px] bg-(--primary) p-5 text-white md:px-8 md:py-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/velun-mark.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-28 h-[360px] w-[420px] object-contain opacity-[0.12] md:-top-28 md:-right-24 md:h-[420px] md:w-[520px]"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <div className="text-sm text-white/80">Saldo hoje</div>
            <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[44px]">
              {signed(currentTotal)}
            </div>
            <div className="mt-1 text-[13px] text-white/75 max-md:hidden">
              Contas correntes e investimentos. Cartão entra pela fatura.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-3 lg:min-w-[540px]">
            <div className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
              <div className="text-[11px] text-white/80 md:text-xs">Em {selectedPeriod.label}</div>
              <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">{signed(endCents)}</div>
            </div>
            <div className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
              <div className="text-[11px] text-white/80 md:text-xs">
                <span className="md:hidden">Menor</span>
                <span className="max-md:hidden">Menor saldo</span>
              </div>
              <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">{signed(lowCents)}</div>
              <div className="text-[11px] text-white/75 max-md:hidden">{lowWhen}</div>
            </div>
            <div className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
              <div className="text-[11px] text-white/80 md:text-xs">
                <span className="md:hidden">No negativo</span>
                <span className="max-md:hidden">Dias no negativo</span>
              </div>
              <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">
                {negDays} {negDays === 1 ? "dia" : "dias"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] bg-(--bg-surface) p-4 shadow-(--shadow-card) md:p-6">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-sm:hidden">
            <h2 className="text-card-title">Saldo projetado</h2>
            <p className="mt-0.5 text-[13px] text-(--text-muted)">{rangeLabel}</p>
          </div>
          <div className="flex gap-1 rounded-[13px] bg-(--bg-track) p-1" role="tablist" aria-label="Período da projeção">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={href({ period: p.days })}
                role="tab"
                aria-selected={p.days === horizonDays}
                className={`flex h-9 flex-1 items-center justify-center rounded-[10px] px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:flex-none ${
                  p.days === horizonDays
                    ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.08)]"
                    : "text-(--text-muted)"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
        <ProjectionChart points={points} currency={currency} highlightedEventIds={[...highlightedEventIds]} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-(--text-muted)">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-[18px] rounded-full" style={{ background: "var(--income)" }} />
            Com o que está previsto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-[18px] rounded-full" style={{ background: "var(--expense)" }} />
            Abaixo de zero
          </span>
          {withOverdue ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[18px] border-t-[2.5px] border-dashed" style={{ borderColor: "var(--expense)" }} />
              Se os atrasados ainda saírem
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6">
        <UpcomingEventsCard events={upcomingEvents} currency={currency} today={today} />
        <PeriodSummaryCard
          periodLabel={selectedPeriod.label}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          netResult={netResult}
          note={note}
          currency={currency}
        />
      </div>
    </div>
  );
}
