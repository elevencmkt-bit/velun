import Link from "next/link";
import { ArrowRight, ArrowUpCircle, ArrowDownCircle, PiggyBank, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { getCashFlowProjection } from "@/lib/cash-flow";
import {
  monthRange,
  shiftMonth,
  monthParam,
  monthLabel,
  shortMonthLabel,
  parseMonthParam,
} from "@/lib/month";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import { accountScope, scopeLabel, type AccountScope } from "@/lib/visibility";
import { excludeTransfers, groupExpensesByCategory, sumByDirection } from "@/lib/reports";
import { getAccountBalances } from "@/lib/balances";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/category-badge";
import { MonthSelector } from "@/components/month-selector";
import { MonthDonut } from "./month-donut";
import { TrendBarChart, type TrendPoint } from "./trend-bar-chart";
import { CashFlowChart } from "../fluxo-de-caixa/cash-flow-chart";
import { ForecastCard } from "./forecast-card";
import { Money } from "@/components/money";

const CASH_FLOW_PREVIEW_DAYS = 30;
const TREND_MONTHS = 6;
const RECENT_TRANSACTIONS_LIMIT = 6;
const PENDING_PREVIEW_LIMIT = 4;

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

type PendingPreviewRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
};

async function fetchPendingPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  scope: AccountScope,
): Promise<PendingPreviewRow[]> {
  if (scope.ids.length === 0) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, description, amount_cents, direction")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .in("account_id", scope.ids)
    .order("date", { ascending: true })
    .limit(PENDING_PREVIEW_LIMIT);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Comparação com o mês anterior em texto calmo: o valor de lá, não uma
// porcentagem. "↑1035%" assustava mais do que informava — basta um mês
// fraco antes pra qualquer mês normal parecer uma explosão.
function PreviousMonth({
  label,
  cents,
  currency,
}: {
  label: string;
  cents: number;
  currency: CurrencyCode;
}) {
  return (
    <span className="text-xs text-(--text-muted)">
      Em {label}: <Money cents={cents} currency={currency} />
    </span>
  );
}

const MAX_DASHBOARD_ACCOUNTS = 5;

function StatCard({
  label,
  value,
  icon: Icon,
  badgeBg,
  badgeFg,
  valueColor,
  delta,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  badgeBg: string;
  badgeFg: string;
  valueColor: string;
  delta: React.ReactNode;
}) {
  return (
    <Card>
      {/* Celular: dois indicadores por linha, então o ícone sobe e o
          valor ganha a largura toda do cartão. */}
      <CardContent className="flex min-h-[112px] flex-col items-start gap-3 sm:min-h-[128px] sm:flex-row sm:items-center sm:gap-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-16 sm:w-16 sm:rounded-2xl"
          style={{ backgroundColor: badgeBg }}
        >
          <Icon className="h-5 w-5 sm:h-8 sm:w-8" style={{ color: badgeFg }} />
        </div>
        <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
          <span className="text-kpi-label">{label}</span>
          <span className="money text-kpi-value" style={{ color: valueColor }}>
            {value}
          </span>
          {delta}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { householdId, memberId, currency, displayName } = await getCurrentMember();
  const supabase = await createClient();
  const { month } = await searchParams;
  const { year, monthIndex } = parseMonthParam(month);

  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const prevRange = monthRange(prev.year, prev.monthIndex);
  const next = shiftMonth(year, monthIndex, 1);

  const trendStart = shiftMonth(year, monthIndex, -(TREND_MONTHS - 1));
  const trendRangeStart = monthRange(trendStart.year, trendStart.monthIndex).start;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", householdId)
    .limit(1);
  const householdIsEmpty = !accounts || accounts.length === 0;

  // Três escopos nesta tela. Os totais e o donut agregam por categoria, o
  // saldo/fluxo aceita até `balance_only`, e o extrato só mostra conta
  // `shared`. Como transactionsScope é subconjunto de categoriesScope, as
  // transações recentes saem de `current` filtrado — sem segunda query.
  const [categoriesScope, balanceScope, transactionsScope] = await Promise.all([
    accountScope(supabase, householdId, memberId, "categories"),
    accountScope(supabase, householdId, memberId, "balance"),
    accountScope(supabase, householdId, memberId, "transactions"),
  ]);

  const [
    currentRows,
    prevRows,
    trendRows,
    colorMap,
    cashFlow,
    pendingPreview,
    pendingCurrentRows,
    balances,
    { data: accountRows },
    { data: memberRows },
  ] = await Promise.all([
      fetchMonthTransactions(supabase, householdId, start, end, categoriesScope),
      fetchMonthTransactions(supabase, householdId, prevRange.start, prevRange.end, categoriesScope),
      fetchMonthTransactions(supabase, householdId, trendRangeStart, end, categoriesScope),
      getCategoryColorMap(supabase, householdId),
      getCashFlowProjection(supabase, householdId, CASH_FLOW_PREVIEW_DAYS, balanceScope),
      fetchPendingPreview(supabase, householdId, transactionsScope),
      fetchMonthTransactions(supabase, householdId, start, end, categoriesScope, "pending"),
      getAccountBalances(supabase, householdId, balanceScope),
      supabase
        .from("accounts")
        .select("id, name, type, owner_id")
        .eq("household_id", householdId)
        .eq("is_archived", false)
        .in("id", balanceScope.ids.length > 0 ? balanceScope.ids : ["00000000-0000-0000-0000-000000000000"])
        .order("sort_order")
        .order("name"),
      supabase.from("members").select("id, display_name").eq("household_id", householdId),
    ]);

  const current = excludeTransfers(currentRows);
  const previous = excludeTransfers(prevRows);
  const trend = excludeTransfers(trendRows);
  const pendingCurrent = excludeTransfers(pendingCurrentRows);

  const entrou = sumByDirection(current, "in");
  const saiu = sumByDirection(current, "out");
  const sobrou = entrou - saiu;

  const entrouPrev = sumByDirection(previous, "in");
  const saiuPrev = sumByDirection(previous, "out");
  const sobrouPrev = entrouPrev - saiuPrev;
  const prevMonthName = new Date(prev.year, prev.monthIndex, 1).toLocaleDateString("pt-BR", { month: "long" });

  // Contas com saldo, na ordem da tela Contas. De quem é cada uma vai
  // escrito: "Minha", "Do casal" ou o nome de quem é dona.
  const memberNames = new Map((memberRows ?? []).map((m) => [m.id as string, m.display_name as string]));
  const dashboardAccounts = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    type: a.type as string,
    owner:
      a.owner_id === null
        ? "Do casal"
        : a.owner_id === memberId
          ? "Minha"
          : (memberNames.get(a.owner_id as string) ?? "Pessoal"),
    balance: balances.get(a.id as string) ?? 0,
  }));
  const firstName = displayName?.trim().split(/\s+/)[0] ?? "";

  const entrouPendente = sumByDirection(pendingCurrent, "in");
  const saiuPendente = sumByDirection(pendingCurrent, "out");
  const entrouPrevisto = entrou + entrouPendente;
  const saiuPrevisto = saiu + saiuPendente;
  const sobrouPrevisto = entrouPrevisto - saiuPrevisto;

  const slices = groupExpensesByCategory(current).map((slice) => ({
    ...slice,
    color: (colorMap.get(slice.name) ?? MUTED_CATEGORY_COLOR).fg,
  }));

  const visibleIds = new Set(transactionsScope.ids);
  const recentTransactions = current
    .filter((row) => visibleIds.has(row.account_id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_TRANSACTIONS_LIMIT);

  // Rótulo de escopo: quando a soma é parcial, o card diz quantas contas
  // ficaram de fora — nunca qual nem quanto.
  const totalsScopeLabel = scopeLabel(categoriesScope);

  const trendPoints: TrendPoint[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const m = shiftMonth(year, monthIndex, -i);
    const range = monthRange(m.year, m.monthIndex);
    const monthRows = trend.filter((r) => r.date >= range.start && r.date <= range.end);
    trendPoints.push({
      label: shortMonthLabel(m.year, m.monthIndex),
      entrou_cents: sumByDirection(monthRows, "in"),
      saiu_cents: sumByDirection(monthRows, "out"),
    });
  }

  if (householdIsEmpty) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-page-title">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Nada por aqui ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-(--text-secondary)">
            Nenhuma conta ainda. Cadastre uma conta em{" "}
            <span className="font-medium">Contas</span> ou lance algo em{" "}
            <span className="font-medium">Transações</span> para começar.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">{firstName ? `Olá, ${firstName}` : "Dashboard"}</h1>
          <p className="text-page-subtitle">
            Seu resumo de <span className="lowercase">{monthLabel(year, monthIndex)}</span>.
          </p>
        </div>
        <MonthSelector
          label={monthLabel(year, monthIndex)}
          prevHref={`/mes?month=${monthParam(prev.year, prev.monthIndex)}`}
          nextHref={`/mes?month=${monthParam(next.year, next.monthIndex)}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <StatCard
          label="Saldo total"
          value={formatCents(cashFlow.currentTotal, currency)}
          icon={Wallet}
          badgeBg="var(--badge-blue-bg)"
          badgeFg="var(--badge-blue-fg)"
          valueColor={cashFlow.currentTotal < 0 ? "var(--expense)" : "var(--text-primary)"}
          delta={<span className="text-xs text-(--text-light)">Todas as contas, hoje</span>}
        />
        <StatCard
          label="Entrou"
          value={formatCents(entrou, currency)}
          icon={ArrowUpCircle}
          badgeBg="var(--badge-green-bg)"
          badgeFg="var(--badge-green-fg)"
          valueColor="var(--income)"
          delta={<PreviousMonth label={prevMonthName} cents={entrouPrev} currency={currency} />}
        />
        <StatCard
          label="Saiu"
          value={formatCents(saiu, currency)}
          icon={ArrowDownCircle}
          badgeBg="var(--badge-red-bg)"
          badgeFg="var(--badge-red-fg)"
          valueColor="var(--expense)"
          delta={<PreviousMonth label={prevMonthName} cents={saiuPrev} currency={currency} />}
        />
        <StatCard
          label="Sobrou"
          value={formatCents(sobrou, currency)}
          icon={PiggyBank}
          badgeBg="var(--badge-blue-bg)"
          badgeFg="var(--badge-blue-fg)"
          valueColor={sobrou < 0 ? "var(--expense)" : "var(--income)"}
          delta={<PreviousMonth label={prevMonthName} cents={sobrouPrev} currency={currency} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Contas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {dashboardAccounts.length === 0 ? (
              <p className="text-sm text-(--text-muted)">Nenhuma conta ativa.</p>
            ) : (
              <div className="flex flex-col">
                {dashboardAccounts.slice(0, MAX_DASHBOARD_ACCOUNTS).map((account) => {
                  const Icon = ACCOUNT_TYPE_ICONS[account.type] ?? Wallet;
                  return (
                    <div
                      key={account.id}
                      className="flex min-h-[56px] items-center gap-3 border-b border-(--border-soft) last:border-0"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: "var(--badge-purple-bg)" }}
                      >
                        <Icon className="h-4 w-4" style={{ color: "var(--badge-purple-fg)" }} />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-(--text-primary)">{account.name}</span>
                        <span className="truncate text-xs text-(--text-muted)">
                          {account.owner} · {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        </span>
                      </div>
                      <span
                        className="shrink-0 text-sm font-semibold tabular-nums"
                        style={{ color: account.balance < 0 ? "var(--expense)" : "var(--text-primary)" }}
                      >
                        <Money cents={account.balance} currency={currency} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href="/contas"
              className="mt-3 flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text-primary)"
            >
              {dashboardAccounts.length > MAX_DASHBOARD_ACCOUNTS
                ? `Ver todas as ${dashboardAccounts.length} contas`
                : "Gerenciar contas"}{" "}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Despesas por categoria</CardTitle>
            {totalsScopeLabel ? (
              <p className="text-xs text-(--text-muted)">{totalsScopeLabel}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            <MonthDonut slices={slices} compact currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Fluxo de caixa</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="text-kpi-label">Saldo atual</span>
                <span className="font-semibold tabular-nums text-(--text-primary)">
                  <Money cents={cashFlow.currentTotal} currency={currency} />
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-kpi-label">Em {CASH_FLOW_PREVIEW_DAYS} dias</span>
                <span className="font-semibold tabular-nums text-(--text-primary)">
                  <Money cents={cashFlow.finalPoint.balance_cents} currency={currency} />
                </span>
              </div>
            </div>
            <CashFlowChart points={cashFlow.points} compact currency={currency} />
            <Link
              href="/fluxo-de-caixa"
              className="flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text-primary)"
            >
              Ver detalhes <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.9fr_0.9fr] lg:gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Transações recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-(--text-muted)">Nenhuma transação neste mês.</p>
            ) : (
              <div className="flex flex-col">
                {recentTransactions.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 transition-colors last:border-0 hover:bg-[#F9FAFB]"
                  >
                    <span className="text-metadata w-14 shrink-0">{shortDate(row.date)}</span>
                    <span className="text-table-body w-40 flex-1 truncate text-(--text-primary)">
                      {row.description}
                    </span>
                    <CategoryBadge
                      name={row.category_name ?? ""}
                      color={colorMap.get(row.category_name ?? "")}
                    />
                    <span
                      className="ml-auto text-right font-semibold tabular-nums"
                      style={{
                        color:
                          row.direction === "out"
                            ? "var(--table-amount-out)"
                            : "var(--table-amount-in)",
                      }}
                    >
                      {row.direction === "out" ? "-" : "+"}
                      <Money cents={row.amount_cents} currency={currency} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/transacoes"
              className="mt-3 flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text-primary)"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">A vencer</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingPreview.length === 0 ? (
              <p className="text-sm text-(--text-muted)">Nenhuma pendência.</p>
            ) : (
              <div className="flex flex-col">
                {pendingPreview.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 transition-colors last:border-0 hover:bg-[#F9FAFB]"
                  >
                    <span className="text-table-body flex-1 truncate text-(--text-primary)">
                      {row.description}
                    </span>
                    <span className="text-metadata shrink-0">{shortDate(row.date)}</span>
                    <span
                      className="ml-auto shrink-0 text-right font-semibold tabular-nums"
                      style={{
                        color:
                          row.direction === "out"
                            ? "var(--table-amount-out)"
                            : "var(--table-amount-in)",
                      }}
                    >
                      {row.direction === "out" ? "-" : "+"}
                      <Money cents={row.amount_cents} currency={currency} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/a-pagar"
              className="mt-3 flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--text-primary)"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <ForecastCard
          entradaRealizado={entrou}
          entradaPrevisto={entrouPrevisto}
          saidaRealizado={saiu}
          saidaPrevisto={saiuPrevisto}
          saldoRealizado={sobrou}
          saldoPrevisto={sobrouPrevisto}
          currency={currency}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-card-title">Entradas vs saídas</CardTitle>
          <p className="text-xs text-(--text-muted)">Últimos {TREND_MONTHS} meses</p>
        </CardHeader>
        <CardContent>
          <TrendBarChart points={trendPoints} compact currency={currency} />
        </CardContent>
      </Card>
    </div>
  );
}
