import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import type { CurrencyCode } from "@/lib/money";
import {
  getCategoryColorMap,
  MUTED_CATEGORY_COLOR,
} from "@/lib/category-colors";
import { getCategoryIcon, getCategoryIconMap } from "@/lib/category-icons";
import { getCashFlowProjection, type CashFlowPoint } from "@/lib/cash-flow";
import {
  monthRange,
  shiftMonth,
  monthParam,
  monthLabel,
  shortMonthLabel,
  parseMonthParam,
} from "@/lib/month";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import { addDaysISO } from "@/lib/today";
import { accountScope, scopeLabel, type AccountScope } from "@/lib/visibility";
import {
  excludeTransfers,
  groupByCategory,
  sumByDirection,
} from "@/lib/reports";
import { getAccountBalances } from "@/lib/balances";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { AccountAvatar } from "@/components/account-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthSelector } from "@/components/month-selector";
import { WhereList } from "./where-list";
import { AccountFilter } from "@/components/account-filter";
import { Money } from "@/components/money";
import { TrendBarChart, type TrendPoint } from "./trend-bar-chart";
import { CashFlowChart } from "../fluxo-de-caixa/cash-flow-chart";
import { cardBills, loadCards } from "@/lib/cards";
import { CardStack } from "@/components/card-stack";
import { themedPair } from "@/lib/theme-color";
import { ScreenHelp } from "@/components/screen-help";

const CASH_FLOW_PREVIEW_DAYS = 30;
const TREND_MONTHS = 6;
const RECENT_TRANSACTIONS_LIMIT = 5;
const UPCOMING_LIMIT = 3;
const MAX_DASHBOARD_ACCOUNTS = 5;
const WHERE_LIMIT = 4;

// Cores das barrinhas de "Para onde foi", na ordem do ranking. Fixas (não
// a cor da categoria): a lista é curta e o que importa é a proporção.
const WHERE_COLORS = ["#536DFE", "#FF8A5C", "#A78BFA", "#27C499"];

const OUT = "var(--expense-dark)";
const IN = "var(--income-dark)";

function dayAndMonth(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "")
      .toUpperCase(),
  };
}

function shortDate(date: string) {
  const { day, month } = dayAndMonth(date);
  return `${Number(day)} ${month.toLowerCase()}`;
}

type PendingRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  account_id?: string;
};

async function fetchPending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  scope: AccountScope,
  until: string,
): Promise<PendingRow[]> {
  if (scope.ids.length === 0) return [];
  const { data, error } = await supabase
    // limite: pendentes até o fim do mês mostrado
    .from("transactions")
    .select(
      "id, date, description, amount_cents, direction, transfer_group_id, account_id",
    )
    .eq("household_id", householdId)
    .eq("status", "pending")
    .in("account_id", scope.ids)
    .lte("date", until)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => !r.transfer_group_id) as PendingRow[];
}

function sumCents(rows: PendingRow[]) {
  return rows.reduce((s, r) => s + r.amount_cents, 0);
}

/** Linha do saldo dos próximos 30 dias, no bloco azul. */
function Sparkline({ points }: { points: CashFlowPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * 400,
    y: 62 - ((v - min) / span) * 54,
  }));
  // Curva suave pelos pontos médios: cada trecho é uma curva que usa o
  // ponto real como controle. Fica arredondada sem passar além dos
  // valores de verdade.
  const f = (n: number) => n.toFixed(1);
  let path = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    path += ` Q${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  path += ` L${f(last.x)} ${f(last.y)}`;
  return (
    <svg
      viewBox="0 0 400 70"
      preserveAspectRatio="none"
      aria-hidden
      className="h-14 w-full"
    >
      <path
        d={path}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** As duas linhas que se encontram do símbolo da marca, como estampa. */
function BrandMotif({ className }: { className?: string }) {
  return (
    <img
      src="/velun-mark.png"
      alt=""
      aria-hidden
      className={`object-contain ${className ?? ""}`}
    />
  );
}

function SectionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-(--primary) hover:text-(--primary-hover)"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Amount({
  cents,
  direction,
  currency,
}: {
  cents: number;
  direction: "in" | "out";
  currency: CurrencyCode;
}) {
  return (
    <span
      className="shrink-0 text-right text-[14px] font-semibold tabular-nums"
      style={{ color: direction === "out" ? OUT : IN }}
    >
      {direction === "out" ? "−" : "+"}
      <Money cents={cents} currency={currency} />
    </span>
  );
}

function Signed({
  cents,
  currency,
}: {
  cents: number;
  currency: CurrencyCode;
}) {
  return (
    <>
      {cents < 0 ? "−" : ""}
      <Money cents={Math.abs(cents)} currency={currency} />
    </>
  );
}

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string }>;
}) {
  const { householdId, memberId, currency, displayName, today } =
    await getCurrentMember();
  const supabase = await createClient();
  const { month, account: accountParam } = await searchParams;
  const { year, monthIndex } = parseMonthParam(month, today);

  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const prevRange = monthRange(prev.year, prev.monthIndex);
  const next = shiftMonth(year, monthIndex, 1);

  const trendStart = shiftMonth(year, monthIndex, -(TREND_MONTHS - 1));
  const trendRangeStart = monthRange(
    trendStart.year,
    trendStart.monthIndex,
  ).start;

  const weekEnd = addDaysISO(today, 6);
  const horizon = addDaysISO(today, CASH_FLOW_PREVIEW_DAYS);
  const firstName = displayName?.trim().split(/\s+/)[0] ?? "";

  const { data: anyAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", householdId)
    .limit(1);
  if (!anyAccount || anyAccount.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-page-title">
          {firstName ? `Olá, ${firstName}` : "Início"}
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">
              Nada por aqui ainda
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-(--text-secondary)">
            Cadastre uma conta em <span className="font-medium">Contas</span> ou
            lance algo em <span className="font-medium">Transações</span> para
            começar.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Três escopos: totais e categorias agregam (`categories`), saldo e
  // fluxo aceitam `balance_only`, e lançamento a lançamento só conta
  // `shared`.
  const [fullCategoriesScope, fullBalanceScope, fullTransactionsScope] =
    await Promise.all([
      accountScope(supabase, householdId, memberId, "categories"),
      accountScope(supabase, householdId, memberId, "balance"),
      accountScope(supabase, householdId, memberId, "transactions"),
    ]);

  // Filtro de conta (?account=): estreita os três escopos pra uma conta
  // só. Nunca alarga — conta que a pessoa não vê é ignorada.
  const accountFilter =
    accountParam && fullBalanceScope.ids.includes(accountParam)
      ? accountParam
      : null;
  const only = (scope: AccountScope): AccountScope =>
    accountFilter
      ? { ids: scope.ids.filter((id) => id === accountFilter), excludedCount: 0 }
      : scope;
  const categoriesScope = only(fullCategoriesScope);
  const balanceScope = only(fullBalanceScope);
  const transactionsScope = only(fullTransactionsScope);

  const [
    currentRows,
    prevRows,
    trendRows,
    colorMap,
    iconMap,
    cashFlow,
    pendingRaw,
    balances,
    { data: accountRows },
    { data: memberRows },
    cards,
  ] = await Promise.all([
    fetchMonthTransactions(supabase, householdId, start, end, categoriesScope),
    fetchMonthTransactions(
      supabase,
      householdId,
      prevRange.start,
      prevRange.end,
      categoriesScope,
    ),
    fetchMonthTransactions(
      supabase,
      householdId,
      trendRangeStart,
      end,
      categoriesScope,
    ),
    getCategoryColorMap(supabase, householdId),
    getCategoryIconMap(supabase, householdId),
    getCashFlowProjection(
      supabase,
      householdId,
      CASH_FLOW_PREVIEW_DAYS,
      balanceScope,
      today,
    ),
    fetchPending(supabase, householdId, transactionsScope, horizon),
    getAccountBalances(supabase, householdId, fullBalanceScope),
    supabase
      .from("accounts")
      .select("id, name, type, owner_id, institution")
      .neq("type", "credit_card")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .in(
        "id",
        fullBalanceScope.ids.length > 0
          ? fullBalanceScope.ids
          : ["00000000-0000-0000-0000-000000000000"],
      )
      .order("sort_order")
      .order("name"),
    supabase
      .from("members")
      .select("id, display_name")
      .eq("household_id", householdId),
    loadCards(supabase, householdId, memberId, today),
  ]);

  const current = excludeTransfers(currentRows);
  const previous = excludeTransfers(prevRows);
  const trend = excludeTransfers(trendRows);

  const entrou = sumByDirection(current, "in");
  const saiu = sumByDirection(current, "out");
  const sobrou = entrou - saiu;
  const sobrouPrev =
    sumByDirection(previous, "in") - sumByDirection(previous, "out");
  const sobrouDiff = sobrou - sobrouPrev;

  const monthName = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  const MonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const prevMonthName = new Date(
    prev.year,
    prev.monthIndex,
    1,
  ).toLocaleDateString("pt-BR", { month: "long" });
  const selected = monthParam(year, monthIndex);
  const thisMonth = today.slice(0, 7);

  // Uma frase que diz como o mês foi, em vez de só "Dashboard".
  const headline =
    selected > thisMonth ? (
      <>Previsão de {monthName}.</>
    ) : selected === thisMonth ? (
      sobrou >= 0 ? (
        <>
          Até agora em {monthName}, sobraram{" "}
          <Money cents={sobrou} currency={currency} />.
        </>
      ) : (
        <>
          Até agora em {monthName}, saiu{" "}
          <Money cents={-sobrou} currency={currency} /> a mais do que entrou.
        </>
      )
    ) : sobrou >= 0 ? (
      <>
        {MonthName} fechou no azul. Sobraram{" "}
        <Money cents={sobrou} currency={currency} />.
      </>
    ) : (
      <>
        {MonthName} fechou no vermelho. Faltaram{" "}
        <Money cents={-sobrou} currency={currency} />.
      </>
    );

  // Contas com saldo, na ordem da tela Contas.
  const memberNames = new Map(
    (memberRows ?? []).map((m) => [m.id as string, m.display_name as string]),
  );
  const accounts = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    type: a.type as string,
    institution: (a.institution as string | null) ?? null,
    owner:
      a.owner_id === null
        ? "Do casal"
        : a.owner_id === memberId
          ? "Minha"
          : (memberNames.get(a.owner_id as string) ?? "Pessoal"),
    balance: balances.get(a.id as string) ?? 0,
  }));
  const filtered = accountFilter
    ? (accounts.find((a) => a.id === accountFilter) ?? null)
    : null;
  // Mantém a conta escolhida ao trocar de mês, e vice-versa.
  const accountQS = accountFilter ? `&account=${accountFilter}` : "";

  // Vencimentos: o que já passou, o que cai nesta semana e o que entra.
  // Compra prevista no cartão vai dentro da fatura, que entra como um
  // item só (das faturas que esta pessoa paga ou pode ver por inteiro).
  const cardIds = new Set(cards.map((c) => c.id));
  const billRows: PendingRow[] = cardBills(
    cards.filter(
      (c) =>
        (c.canEdit || c.canSeeTransactions) &&
        (!accountFilter || c.paymentAccountId === accountFilter),
    ),
  )
    .filter((b) => b.date <= horizon)
    .map((b) => ({
      id: `fatura:${b.id}`,
      date: b.date,
      description: `Fatura · ${b.cardName}`,
      amount_cents: b.amountCents,
      direction: "out",
    }));
  const pending = [
    ...pendingRaw.filter((p) => !cardIds.has(p.account_id ?? "")),
    ...billRows,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const overdueOut = sumCents(
    pending.filter((p) => p.date < today && p.direction === "out"),
  );
  const weekOut = sumCents(
    pending.filter(
      (p) => p.date >= today && p.date <= weekEnd && p.direction === "out",
    ),
  );
  const toReceive = sumCents(pending.filter((p) => p.direction === "in"));
  const upcoming = pending
    .filter((p) => p.date >= today)
    .slice(0, UPCOMING_LIMIT);

  // Para onde foi: as maiores categorias de verdade; "Sem categoria" vira
  // um lembrete embaixo, não uma barra que engole as outras.
  const expenseRanking = groupByCategory(current, "out");
  const uncategorized =
    expenseRanking.find((s) => s.name === "Sem categoria")?.amount_cents ?? 0;
  const where = expenseRanking
    .filter((s) => s.name !== "Sem categoria")
    .slice(0, WHERE_LIMIT);
  const whereMax = where[0]?.amount_cents ?? 1;

  const visibleIds = new Set(transactionsScope.ids);
  const recent = current
    .filter((row) => visibleIds.has(row.account_id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_TRANSACTIONS_LIMIT);

  const trendPoints: TrendPoint[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const m = shiftMonth(year, monthIndex, -i);
    const range = monthRange(m.year, m.monthIndex);
    const monthRows = trend.filter(
      (r) => r.date >= range.start && r.date <= range.end,
    );
    trendPoints.push({
      label: shortMonthLabel(m.year, m.monthIndex),
      entrou_cents: sumByDirection(monthRows, "in"),
      saiu_cents: sumByDirection(monthRows, "out"),
    });
  }

  const totalsScopeLabel = scopeLabel(categoriesScope);
  const barMax = Math.max(Math.abs(sobrou), Math.abs(sobrouPrev), 1);
  const sobrouBars = [
    {
      label: shortMonthLabel(prev.year, prev.monthIndex),
      value: sobrouPrev,
      current: false,
    },
    { label: shortMonthLabel(year, monthIndex), value: sobrou, current: true },
  ];

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-page-title">
              {firstName ? `Olá, ${firstName}` : "Início"}
            </h1>
            <ScreenHelp screen="mes" />
          </div>
          <p className="text-page-subtitle">{headline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {accounts.length > 1 ? (
            <AccountFilter
              value={accountFilter}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                institution: a.institution,
              }))}
            />
          ) : null}
          <MonthSelector
            label={monthLabel(year, monthIndex)}
            prevHref={`/mes?month=${monthParam(prev.year, prev.monthIndex)}${accountQS}`}
            nextHref={`/mes?month=${monthParam(next.year, next.monthIndex)}${accountQS}`}
            month={selected}
            today={today}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        {/* Saldo: o único bloco colorido da tela. */}
        <section className="relative flex min-h-[236px] flex-col overflow-hidden rounded-[24px] bg-(--primary) p-6 text-white md:p-7 lg:col-span-5">
          <BrandMotif className="pointer-events-none absolute -top-20 -right-24 h-[340px] w-[340px] opacity-[0.16]" />
          <span className="text-[14px] font-medium text-white/85">
            {filtered ? `Saldo · ${filtered.name} · hoje` : "Saldo total · hoje"}
          </span>
          <span className="mt-2 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[40px]">
            <Signed cents={cashFlow.currentTotal} currency={currency} />
          </span>
          <span className="mt-1 text-[13px] text-white/80">
            {filtered
              ? "Só esta conta"
              : `${accounts.length} ${accounts.length === 1 ? "conta" : "contas"}`}{" "}
            · em{" "}
            {CASH_FLOW_PREVIEW_DAYS} dias:{" "}
            <Signed
              cents={cashFlow.finalPoint.balance_cents}
              currency={currency}
            />
          </span>
          <div className="mt-auto pt-4">
            <Sparkline points={cashFlow.points} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
              ↑ Entrou <Money cents={entrou} currency={currency} />
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
              ↓ Saiu <Money cents={saiu} currency={currency} />
            </span>
          </div>
        </section>

        {/* Cartão de crédito: o primeiro cartão desenhado, com a fatura
            aberta. Sem cartão, o espaço mostra o saldo dos próximos 30 dias. */}
        {cards.length > 0 && !accountFilter ? (
          <CardStack
            className="lg:col-span-4"
            title={cards.length === 1 ? "Cartão" : `Cartões · ${cards.length}`}
            currency={currency}
            cards={cards.map((c) => ({
              id: c.id,
              name: c.name,
              lastFour: c.lastFour,
              color: c.color,
              caption: `Fatura aberta · vence ${shortDate(c.current.due)}`,
              amountCents: c.current.totalCents,
              usedPct: c.limitCents
                ? Math.min(100, (c.debtCents / c.limitCents) * 100)
                : null,
              footerLeft: `Fecha ${shortDate(c.current.closing)}`,
              freeCents: c.limitCents ? c.limitCents - c.debtCents : null,
            }))}
          />
        ) : (
          <Card className="lg:col-span-4">
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-card-title">
                  Próximos {CASH_FLOW_PREVIEW_DAYS} dias
                </h2>
                <SectionLink href="/fluxo-de-caixa">Detalhes</SectionLink>
              </div>
              <div className="flex items-end justify-between text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-(--text-muted)">Hoje</span>
                  <span className="font-semibold tabular-nums">
                    <Signed cents={cashFlow.currentTotal} currency={currency} />
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-(--text-muted)">
                    Em {shortDate(cashFlow.finalPoint.date)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    <Signed
                      cents={cashFlow.finalPoint.balance_cents}
                      currency={currency}
                    />
                  </span>
                </div>
              </div>
              <div className="mt-auto">
                <CashFlowChart
                  points={cashFlow.points}
                  compact
                  currency={currency}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-3">
          <CardContent className="flex h-full flex-col">
            <h2 className="text-card-title">Sobrou</h2>
            <span
              className="mt-3 text-[30px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums"
              style={{ color: sobrou < 0 ? OUT : IN }}
            >
              <Signed cents={sobrou} currency={currency} />
            </span>
            <span className="mt-1 text-[13px] text-(--text-muted)">
              <Money cents={Math.abs(sobrouDiff)} currency={currency} />{" "}
              {sobrouDiff >= 0 ? "a mais" : "a menos"} que em {prevMonthName}
            </span>
            <div className="mt-auto flex h-24 items-end gap-3.5 pt-5">
              {sobrouBars.map((bar) => (
                <div
                  key={bar.label}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div
                    className="w-full rounded-[10px]"
                    style={{
                      height: `${Math.max(8, (Math.abs(bar.value) / barMax) * 64)}px`,
                      background:
                        bar.value < 0
                          ? "var(--expense-soft)"
                          : bar.current
                            ? "var(--income)"
                            : "var(--income-soft)",
                    }}
                  />
                  <span
                    className={`text-xs ${bar.current ? "font-semibold text-(--text-primary)" : "text-(--text-muted)"}`}
                  >
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardContent className="flex h-full flex-col">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-card-title">Contas</h2>
              <SectionLink href="/contas">Gerenciar</SectionLink>
            </div>
            {accounts.length === 0 ? (
              <p className="text-sm text-(--text-muted)">
                Nenhuma conta ativa.
              </p>
            ) : (
              accounts.slice(0, MAX_DASHBOARD_ACCOUNTS).map((account) => (
                // Um clique na conta filtra o Dashboard por ela; outro tira.
                <Link
                  key={account.id}
                  href={`/mes?month=${selected}${account.id === accountFilter ? "" : `&account=${account.id}`}`}
                  aria-current={account.id === accountFilter ? "true" : undefined}
                  title={account.id === accountFilter ? "Ver todas as contas" : `Ver só ${account.name}`}
                  className={`-mx-2 flex min-h-[60px] items-center gap-3 rounded-[14px] px-2 transition-colors ${
                    account.id === accountFilter
                      ? "bg-(--primary-soft)"
                      : "hover:bg-(--bg-subtle)"
                  }`}
                >
                  <AccountAvatar
                    institution={account.institution}
                    type={account.type}
                    size={40}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-(--text-primary)">
                      {account.name}
                    </span>
                    <span className="truncate text-xs text-(--text-muted)">
                      {account.owner} ·{" "}
                      {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                    </span>
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    style={{
                      color: account.balance < 0 ? OUT : "var(--text-primary)",
                    }}
                  >
                    <Signed cents={account.balance} currency={currency} />
                  </span>
                </Link>
              ))
            )}
            {accounts.length > MAX_DASHBOARD_ACCOUNTS ? (
              <div className="mt-2">
                <SectionLink href="/contas">
                  Ver as {accounts.length} contas
                </SectionLink>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardContent className="flex h-full flex-col">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <h2 className="text-card-title">Próximos vencimentos</h2>
              <SectionLink href="/a-pagar">Ver tudo</SectionLink>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <div className="rounded-[14px] bg-(--expense-soft) px-3 py-2.5">
                <div className="text-xs font-semibold text-(--expense-dark)">
                  Atrasadas
                </div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-(--expense-dark) md:text-[17px]">
                  <Money cents={overdueOut} currency={currency} />
                </div>
              </div>
              <div className="rounded-[14px] bg-(--primary-soft) px-3 py-2.5">
                <div className="text-xs font-semibold text-(--primary-hover)">
                  Esta semana
                </div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-(--primary-hover) md:text-[17px]">
                  <Money cents={weekOut} currency={currency} />
                </div>
              </div>
              <div className="rounded-[14px] bg-(--income-soft) px-3 py-2.5">
                <div className="text-xs font-semibold text-(--income-dark)">
                  A receber
                </div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-(--income-dark) md:text-[17px]">
                  <Money cents={toReceive} currency={currency} />
                </div>
              </div>
            </div>
            {upcoming.length === 0 ? (
              <p className="py-3 text-sm text-(--text-muted)">
                Nada vencendo nos próximos {CASH_FLOW_PREVIEW_DAYS} dias.
              </p>
            ) : (
              upcoming.map((row) => {
                const { day, month: mon } = dayAndMonth(row.date);
                return (
                  <div
                    key={row.id}
                    className="flex min-h-[58px] items-center gap-3"
                  >
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-[17px] leading-none font-extrabold">
                        {day}
                      </div>
                      <div className="text-[11px] font-semibold text-(--text-light)">
                        {mon}
                      </div>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {row.description}
                    </span>
                    <Amount
                      cents={row.amount_cents}
                      direction={row.direction}
                      currency={currency}
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardContent className="flex h-full flex-col">
            <h2 className="text-card-title">Para onde foi</h2>
            {totalsScopeLabel ? (
              <p className="text-xs text-(--text-muted)">{totalsScopeLabel}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-3.5">
              {where.length === 0 && uncategorized === 0 ? (
                <p className="text-sm text-(--text-muted)">
                  Nenhuma despesa confirmada neste mês.
                </p>
              ) : null}
              <WhereList
                where={where}
                colors={WHERE_COLORS}
                uncategorized={uncategorized}
                month={selected}
                accountId={accountFilter}
                currency={currency}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardContent className="flex h-full flex-col">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-card-title">Últimos lançamentos</h2>
              <SectionLink href={`/transacoes?month=${selected}${accountQS}`}>
                Ver todos
              </SectionLink>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-(--text-muted)">
                Nenhum lançamento neste mês.
              </p>
            ) : (
              recent.map((row) => {
                const Icon = getCategoryIcon(
                  row.category_name,
                  row.direction,
                  row.category_name
                    ? (iconMap.get(row.category_name) ?? null)
                    : null,
                );
                const colors = themedPair(
                  row.category_name
                    ? (colorMap.get(row.category_name) ?? MUTED_CATEGORY_COLOR)
                    : MUTED_CATEGORY_COLOR,
                );
                return (
                  <div
                    key={row.id}
                    className="flex min-h-[60px] items-center gap-3"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{ background: colors.bg, color: colors.fg }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {row.description}
                      </span>
                      <span className="truncate text-xs text-(--text-muted)">
                        {shortDate(row.date)} ·{" "}
                        {row.category_name ?? "Sem categoria"}
                      </span>
                    </div>
                    <Amount
                      cents={row.amount_cents}
                      direction={row.direction}
                      currency={currency}
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardContent className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-card-title">Entradas e saídas</h2>
              <span className="text-xs text-(--text-muted)">
                {TREND_MONTHS} meses
              </span>
            </div>
            <TrendBarChart points={trendPoints} compact currency={currency} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
