import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { addDaysISO } from "@/lib/today";
import {
  buildCashFlowNote,
  findNegativeAccounts,
  getCashFlowProjection,
  scopeForAccount,
  withoutInvestments,
  type CashAccount,
} from "@/lib/cash-flow";
import { buildSeries } from "@/lib/cash-flow-estimates";
import { loadSpendingEstimate } from "@/lib/spending-limits";
import { loadCashFloor } from "@/lib/cash-floor";
import { loadFreeThisWeek } from "@/lib/free-this-week-load";
import { getAccountBalances } from "@/lib/balances";
import { FreeThisWeekCard } from "@/components/free-this-week-card";
import { accountScope } from "@/lib/visibility";
import { formatCents } from "@/lib/money";
import { ProjectionChart } from "./projection-chart";
import { EstimatesCard, PeriodSummaryCard, UpcomingEventsCard } from "./support-cards";
import { Money } from "@/components/money";
import { ScreenHelp } from "@/components/screen-help";
import { AccountFilter } from "@/components/account-filter";

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
  searchParams: Promise<{ period?: string; atrasados?: string; account?: string; estimados?: string }>;
}) {
  const { period, atrasados, account: accountParam, estimados } = await searchParams;
  const parsedDays = Number(period);
  const selectedPeriod =
    PERIODS.find((p) => p.days === parsedDays) ?? PERIODS.find((p) => p.days === DEFAULT_DAYS)!;
  const horizonDays = selectedPeriod.days;
  const includeOverdue = atrasados === "1";

  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();

  // Contas que entram no saldo de quem está vendo (cartões incluídos, pra
  // saber de qual conta sai cada fatura).
  const fullScope = await accountScope(supabase, householdId, memberId, "balance");
  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type, institution, payment_account_id")
    .eq("household_id", householdId)
    .eq("is_archived", false)
    .in("id", fullScope.ids.length > 0 ? fullScope.ids : ["00000000-0000-0000-0000-000000000000"])
    .order("name");
  const accounts: (CashAccount & { institution: string | null })[] = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    type: a.type as string,
    institution: (a.institution as string | null) ?? null,
    payment_account_id: (a.payment_account_id as string | null) ?? null,
  }));
  // Filtro (?account=): só conta de dinheiro — cartão entra pela conta que paga.
  const cashAccounts = accounts.filter((a) => a.type !== "credit_card");
  const filtered = cashAccounts.find((a) => a.id === accountParam) ?? null;
  // Sem filtro: só o dinheiro disponível. Investimento (corretora) fica de
  // fora do saldo e da projeção e aparece à parte.
  const investmentIds = accounts.filter((a) => a.type === "investment").map((a) => a.id);
  const scope = filtered ? scopeForAccount(fullScope, filtered.id, accounts) : withoutInvestments(fullScope, accounts);
  // Gastos estimados são da casa (limites por categoria, não por conta):
  // só na visão de todas as contas. Ligados por padrão.
  const estimatesOn = !filtered && estimados !== "0";

  const [projection, estimate, floor, free, investmentBalances] = await Promise.all([
    getCashFlowProjection(supabase, householdId, horizonDays, scope, today),
    estimatesOn
      ? loadSpendingEstimate({ supabase, householdId, memberId, today, horizonDays })
      : Promise.resolve(null),
    loadCashFloor(supabase, householdId, memberId),
    filtered ? Promise.resolve(null) : loadFreeThisWeek({ supabase, householdId, memberId, today }),
    !filtered && investmentIds.length > 0
      ? getAccountBalances(supabase, householdId, { ids: investmentIds, excludedCount: 0 })
      : Promise.resolve(new Map<string, number>()),
  ]);
  const { points, overdue, currentTotal, totalIncome, totalExpense, netResult, upcomingEvents, highlightedEventIds } =
    projection;
  const investedCents = [...investmentBalances.values()].reduce((n, v) => n + v, 0);
  // O piso é da casa toda: numa conta só, não vale.
  const floorCents = filtered ? 0 : floor.cents;

  // A série da tela: lançado − estimados (ligados) − atrasados (incluídos).
  const counted = estimate && estimate.totalCents > 0 ? estimate : null;
  const view = buildSeries(points, {
    estimateByDate: counted?.byDate ?? null,
    overdueNetOutCents: includeOverdue ? overdue.netOutCents : 0,
    floorCents,
  });
  const adjusted = Boolean(counted) || (includeOverdue && overdue.count > 0);

  // Sem filtro: avisa se alguma conta fica negativa sozinha no período,
  // mesmo com o total positivo (só com o lançado: o estimado é da casa).
  const negativeAccounts =
    !filtered && cashAccounts.length > 1
      ? await findNegativeAccounts(
          supabase,
          householdId,
          horizonDays,
          fullScope,
          accounts.filter((a) => a.type !== "investment"),
          today,
        )
      : [];

  const fmt = (cents: number) => formatCents(cents, currency);
  const note = buildCashFlowNote({ points: view.series, upcomingEvents, formatMoney: fmt });

  const href = (next: { period?: number; atrasados?: boolean; account?: string | null; estimados?: boolean }) => {
    const q = new URLSearchParams();
    const days = next.period ?? horizonDays;
    if (days !== DEFAULT_DAYS) q.set("period", String(days));
    if (next.atrasados ?? includeOverdue) q.set("atrasados", "1");
    const acc = next.account === undefined ? filtered?.id : next.account;
    if (acc) q.set("account", acc);
    if (!(next.estimados ?? estimados !== "0")) q.set("estimados", "0");
    const qs = q.toString();
    return `/fluxo-de-caixa${qs ? `?${qs}` : ""}`;
  };

  const todayDate = new Date(`${today}T12:00:00`);
  const horizonDate = new Date(`${addDaysISO(today, horizonDays)}T12:00:00`);
  const rangeLabel = `${dateFormatter.format(todayDate)} – ${dateFormatter.format(horizonDate)}`;

  const endCents = view.final.balance_cents;
  const lowCents = view.lowest.balance_cents;
  const lowDate = view.lowest.date;
  const negDays = view.negativeDays;
  const firstNegWhen = view.firstNegative
    ? new Date(`${view.firstNegative.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "")
    : null;
  const lowWhen =
    lowDate === today
      ? "hoje"
      : new Date(`${lowDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  const shortDay = (iso: string) =>
    iso === today
      ? "hoje"
      : new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  const signed = (cents: number) => (
    <>
      {cents < 0 ? "−" : ""}
      <Money cents={Math.abs(cents)} currency={currency} />
    </>
  );

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-page-title">Fluxo de caixa</h1>
            <ScreenHelp screen="fluxo-de-caixa" />
          </div>
          <p className="text-page-subtitle max-sm:hidden">
            Quanto vai ter na conta nos próximos dias, com o previsto e com os gastos do dia a dia.
          </p>
        </div>
        {cashAccounts.length > 1 ? (
          <AccountFilter value={filtered?.id ?? null} accounts={cashAccounts} />
        ) : null}
      </div>

      {free ? <FreeThisWeekCard free={free} currency={currency} /> : null}

      {negativeAccounts.length > 0 ? (
        <div className="flex flex-col gap-2.5 rounded-[16px] bg-(--warning-soft) px-4 py-3.5 md:px-5">
          {negativeAccounts.map((n) => (
            <div key={n.id} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-(--warning-dark)" />
                <p className="text-sm leading-relaxed text-(--warning-ink)">
                  <b>{n.name}</b>{" "}
                  {n.firstNegativeDate === today ? "já está no vermelho" : `fica no vermelho em ${shortDay(n.firstNegativeDate)}`}
                  {" "}e chega a <b>{signed(n.lowestCents)}</b>
                  {n.lowestDate !== n.firstNegativeDate ? ` em ${shortDay(n.lowestDate)}` : ""}
                  {view.lowest.balance_cents >= 0 ? ", mesmo com o total das contas positivo." : "."}
                </p>
              </div>
              <Link
                href={href({ account: n.id })}
                className="flex h-9 shrink-0 items-center self-start rounded-[11px] bg-(--bg-surface) px-3.5 text-[13px] font-semibold whitespace-nowrap text-(--warning-dark) max-md:ml-8 md:self-auto"
              >
                Ver só ela →
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      {overdue.count > 0 ? (
        <div className="flex flex-col gap-3 rounded-[16px] bg-(--danger-soft) px-4 py-3.5 md:flex-row md:items-center md:gap-4 md:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-(--danger-text)" />
            <div className="flex flex-col gap-1 text-sm leading-relaxed text-(--danger-ink)">
              {overdue.outCount > 0 ? (
                <p>
                  <b>
                    {overdue.outCount} {overdue.outCount === 1 ? "pagamento atrasado" : "pagamentos atrasados"} ({signed(-overdue.outCents)})
                  </b>{" "}
                  {includeOverdue
                    ? `${overdue.outCount === 1 ? "está" : "estão"} na projeção como se ${overdue.outCount === 1 ? "saísse" : "saíssem"} hoje.`
                    : `${overdue.outCount === 1 ? "ficou" : "ficaram"} fora da projeção. Se ainda ${overdue.outCount === 1 ? "vai" : "vão"} sair, o saldo real será menor.`}
                </p>
              ) : null}
              {overdue.inCount > 0 ? (
                <p>
                  <b>
                    {overdue.inCount} {overdue.inCount === 1 ? "recebimento atrasado" : "recebimentos atrasados"} (+
                    <Money cents={overdue.inCents} currency={currency} />)
                  </b>{" "}
                  {includeOverdue
                    ? `${overdue.inCount === 1 ? "está" : "estão"} na projeção como se ${overdue.inCount === 1 ? "caísse" : "caíssem"} hoje.`
                    : `${overdue.inCount === 1 ? "ficou" : "ficaram"} fora da projeção. Se ${overdue.inCount === 1 ? "cair" : "caírem"}, o saldo real será maior.`}
                </p>
              ) : null}
              {includeOverdue ? <p>A linha tracejada mostra o efeito.</p> : null}
            </div>
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
            <div className="text-sm text-white/80">{filtered ? `Saldo hoje · ${filtered.name}` : "Disponível hoje"}</div>
            <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[44px]">
              {signed(currentTotal)}
            </div>
            {!filtered && investmentIds.length > 0 ? (
              <span className="mt-1.5 inline-block rounded-full bg-white/18 px-3 py-1 text-[13px]">
                + <Money cents={investedCents} currency={currency} /> em investimentos, fora da projeção
              </span>
            ) : null}
            <div className="mt-1.5 text-[13px] text-white/75 max-md:hidden">
              {filtered
                ? "Só esta conta. A fatura dos cartões pagos por ela sai no vencimento."
                : "Contas correntes e dinheiro. Cartão entra pela fatura."}
            </div>
          </div>
          <div className={`grid ${floorCents > 0 ? "grid-cols-2 md:grid-cols-4 lg:min-w-[680px]" : "grid-cols-3 lg:min-w-[540px]"} gap-2 md:gap-3`}>
            <div className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
              <div className="text-[11px] text-white/80 md:text-xs">Em {selectedPeriod.label}</div>
              <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">{signed(endCents)}</div>
              {adjusted ? (
                <div className="truncate text-[11px] text-white/75 max-md:hidden">só lançado: {signed(view.referenceFinal)}</div>
              ) : null}
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
              {firstNegWhen ? <div className="text-[11px] text-white/75 max-md:hidden">a partir de {firstNegWhen}</div> : null}
            </div>
            {floorCents > 0 ? (
              <div className="order-first rounded-[12px] bg-[rgba(255,214,102,0.28)] px-2.5 py-2.5 md:order-none md:rounded-[16px] md:px-4 md:py-3.5">
                <div className="text-[11px] text-white/80 md:text-xs">Dias abaixo do piso</div>
                <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">
                  {view.belowFloorDays} {view.belowFloorDays === 1 ? "dia" : "dias"}
                </div>
                <div className="truncate text-[11px] text-white/75 max-md:hidden">
                  piso <Money cents={floorCents} currency={currency} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[20px] bg-(--bg-surface) p-4 shadow-(--shadow-card) md:p-6">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-sm:hidden">
            <h2 className="text-card-title">Saldo projetado</h2>
            <p className="mt-0.5 text-[13px] text-(--text-muted)">{rangeLabel}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {!filtered ? (
            <Link
              href={href({ estimados: !estimatesOn })}
              role="switch"
              aria-checked={estimatesOn}
              className="inline-flex items-center gap-2.5 text-[13px] font-semibold text-(--text-secondary)"
            >
              <span
                aria-hidden
                className={`relative h-[24px] w-10 shrink-0 rounded-full transition-colors ${estimatesOn ? "bg-(--primary)" : "bg-(--border-strong)"}`}
              >
                <span
                  className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${estimatesOn ? "left-[19px]" : "left-[3px]"}`}
                />
              </span>
              Incluir gastos estimados
            </Link>
          ) : null}
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
        </div>
        <ProjectionChart
          points={view.series}
          currency={currency}
          highlightedEventIds={[...highlightedEventIds].slice(0, 2)}
          floorCents={floorCents}
        />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-(--text-muted)">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-[18px] rounded-full" style={{ background: "var(--income)" }} />
            {counted ? "Com o previsto e os gastos estimados" : "Com o que está previsto"}
            {includeOverdue && overdue.count > 0 ? " e os atrasados" : ""}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-[18px] rounded-full" style={{ background: "var(--expense)" }} />
            Abaixo de zero
          </span>
          {adjusted ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[18px] border-t-2 border-dashed" style={{ borderColor: "var(--text-light)" }} />
              Só o que está lançado
            </span>
          ) : null}
          {floorCents > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-[18px] border-t-2 border-dashed" style={{ borderColor: "var(--warning)" }} />
              Piso de segurança
            </span>
          ) : null}
        </div>
        {filtered ? (
          <p className="mt-2 text-xs text-(--text-muted)">
            Os gastos estimados e o piso são da casa toda: aparecem na visão de todas as contas.
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6">
        <UpcomingEventsCard events={upcomingEvents} currency={currency} today={today} />
        <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
          <PeriodSummaryCard
            periodLabel={selectedPeriod.label}
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            netResult={netResult}
            estimatedCents={estimate ? estimate.totalCents : null}
            note={note}
            currency={currency}
          />
          {estimate ? <EstimatesCard categories={estimate.categories} floor={floor} currency={currency} /> : null}
        </div>
      </div>
    </div>
  );
}
