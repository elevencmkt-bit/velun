import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowDown, ArrowUpCircle, ArrowDownCircle, PiggyBank, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents } from "@/lib/money";
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
import {
  excludeTransfers,
  groupExpensesByCategory,
  percentChange,
  sumByDirection,
} from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/category-badge";
import { MonthSelector } from "@/components/month-selector";
import { MonthDonut } from "./month-donut";
import { TrendBarChart, type TrendPoint } from "./trend-bar-chart";
import { CashFlowChart } from "../fluxo-de-caixa/cash-flow-chart";
import { ForecastCard } from "./forecast-card";

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
): Promise<PendingPreviewRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, description, amount_cents, direction")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .order("date", { ascending: true })
    .limit(PENDING_PREVIEW_LIMIT);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Badge de tendência. A cor segue se a mudança é favorável para esta
// métrica, não o sinal cru — Saiu caindo é bom (verde), Entrou/Sobrou
// caindo é ruim (vermelho).
function PercentBadge({
  current,
  previous,
  favorable = "up",
}: {
  current: number;
  previous: number;
  favorable?: "up" | "down";
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return <span className="text-xs text-(--text-light)">sem dado anterior</span>;
  }
  const direction = change >= 0 ? "up" : "down";
  const isFavorable = direction === favorable;
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <span
      className="inline-flex w-fit items-center gap-0.5 rounded-full px-[7px] py-[2px] text-[11px] font-semibold"
      style={{
        backgroundColor: isFavorable ? "var(--income-soft)" : "var(--expense-soft)",
        color: isFavorable ? "var(--income-dark)" : "var(--expense-dark)",
      }}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

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
      <CardContent className="flex min-h-[128px] items-center gap-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: badgeBg }}
        >
          <Icon className="h-8 w-8" style={{ color: badgeFg }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-kpi-label">{label}</span>
          <span className="text-kpi-value" style={{ color: valueColor }}>
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
  const { householdId, currency } = await getCurrentMember();
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

  const [currentRows, prevRows, trendRows, colorMap, cashFlow, pendingPreview, pendingCurrentRows] =
    await Promise.all([
      fetchMonthTransactions(supabase, householdId, start, end),
      fetchMonthTransactions(supabase, householdId, prevRange.start, prevRange.end),
      fetchMonthTransactions(supabase, householdId, trendRangeStart, end),
      getCategoryColorMap(supabase, householdId),
      getCashFlowProjection(supabase, householdId, CASH_FLOW_PREVIEW_DAYS),
      fetchPendingPreview(supabase, householdId),
      fetchMonthTransactions(supabase, householdId, start, end, "pending"),
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

  const entrouPendente = sumByDirection(pendingCurrent, "in");
  const saiuPendente = sumByDirection(pendingCurrent, "out");
  const entrouPrevisto = entrou + entrouPendente;
  const saiuPrevisto = saiu + saiuPendente;
  const sobrouPrevisto = entrouPrevisto - saiuPrevisto;

  const slices = groupExpensesByCategory(current).map((slice) => ({
    ...slice,
    color: (colorMap.get(slice.name) ?? MUTED_CATEGORY_COLOR).fg,
  }));

  const recentTransactions = [...current]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_TRANSACTIONS_LIMIT);

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
            <CardTitle className="text-card-title">Household vazio</CardTitle>
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Dashboard</h1>
          <p className="text-page-subtitle">Resumo financeiro de {monthLabel(year, monthIndex)}.</p>
        </div>
        <MonthSelector
          label={monthLabel(year, monthIndex)}
          prevHref={`/mes?month=${monthParam(prev.year, prev.monthIndex)}`}
          nextHref={`/mes?month=${monthParam(next.year, next.monthIndex)}`}
        />
      </div>

      <div className="grid grid-cols-4 gap-5">
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
          delta={<PercentBadge current={entrou} previous={entrouPrev} favorable="up" />}
        />
        <StatCard
          label="Saiu"
          value={formatCents(saiu, currency)}
          icon={ArrowDownCircle}
          badgeBg="var(--badge-red-bg)"
          badgeFg="var(--badge-red-fg)"
          valueColor="var(--expense)"
          delta={<PercentBadge current={saiu} previous={saiuPrev} favorable="down" />}
        />
        <StatCard
          label="Sobrou"
          value={formatCents(sobrou, currency)}
          icon={PiggyBank}
          badgeBg="var(--badge-blue-bg)"
          badgeFg="var(--badge-blue-fg)"
          valueColor={sobrou < 0 ? "var(--expense)" : "var(--income)"}
          delta={<PercentBadge current={sobrou} previous={sobrouPrev} favorable="up" />}
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthDonut slices={slices} compact currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-card-title">Entradas vs saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendBarChart points={trendPoints} compact currency={currency} />
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
                  {formatCents(cashFlow.currentTotal, currency)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-kpi-label">Em {CASH_FLOW_PREVIEW_DAYS} dias</span>
                <span className="font-semibold tabular-nums text-(--text-primary)">
                  {formatCents(cashFlow.finalPoint.balance_cents, currency)}
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

      <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-5">
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
                      {formatCents(row.amount_cents, currency)}
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
                      {formatCents(row.amount_cents, currency)}
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
    </div>
  );
}
