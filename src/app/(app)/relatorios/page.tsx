import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents } from "@/lib/money";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { monthRange, shiftMonth, monthParam, monthLabel, shortMonthLabel, parseMonthParam } from "@/lib/month";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import {
  buildReportInsight,
  dailySeries,
  excludeTransfers,
  groupByCategory,
  groupByCategoryCapped,
  percentChange,
  sumByDirection,
} from "@/lib/reports";
import { MonthSelector } from "@/components/month-selector";
import { ReportViewToggle, type ReportView } from "./report-view-toggle";
import { MonthDonut } from "../mes/month-donut";
import { PeriodEvolutionChart } from "./period-evolution-chart";
import { InsightVelunCard, TopCategoriesCard } from "./bottom-cards";

const KPI_TONES = {
  green: { bg: "#EAFBF2", fg: "#22C55E" },
  red: { bg: "#FFF1F3", fg: "#F04469" },
  blue: { bg: "#EEF4FF", fg: "#3B82F6" },
  purple: { bg: "#F4EEFF", fg: "#8B5CF6" },
};

function CardSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      {children}
    </div>
  );
}

function PercentHelper({
  current,
  previous,
  prevLabel,
}: {
  current: number;
  previous: number;
  prevLabel: string;
}) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="mt-1.5 block text-[11px] text-(--text-light)">sem mês anterior</span>;
  const sign = change >= 0 ? "+" : "";
  return (
    <span className="mt-1.5 block text-[11px] text-(--text-secondary)">
      {sign}
      {change.toFixed(0)}% em relação a {prevLabel}
    </span>
  );
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { householdId, currency } = await getCurrentMember();
  const supabase = await createClient();
  const { month, view: viewParam } = await searchParams;
  const view: ReportView = viewParam === "a-vencer" ? "a-vencer" : "realizado";
  const { year, monthIndex } = parseMonthParam(month);

  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const prevRange = monthRange(prev.year, prev.monthIndex);
  const next = shiftMonth(year, monthIndex, 1);
  const prevLabel = `${shortMonthLabel(prev.year, prev.monthIndex)}/${prev.year}`;

  const status = view === "a-vencer" ? "pending" : "cleared";

  const [rows, prevRows, colorMap] = await Promise.all([
    fetchMonthTransactions(supabase, householdId, start, end, status),
    fetchMonthTransactions(supabase, householdId, prevRange.start, prevRange.end, status),
    getCategoryColorMap(supabase, householdId),
  ]);

  const current = excludeTransfers(rows);
  const previous = excludeTransfers(prevRows);

  const totalIncome = sumByDirection(current, "in");
  const totalExpense = sumByDirection(current, "out");
  const balance = totalIncome - totalExpense;

  const totalIncomePrev = sumByDirection(previous, "in");
  const totalExpensePrev = sumByDirection(previous, "out");
  const balancePrev = totalIncomePrev - totalExpensePrev;

  const expenseRanking = groupByCategory(current, "out");
  const incomeRanking = groupByCategory(current, "in");
  const topExpense = expenseRanking[0];
  const topExpensePrev = groupByCategory(previous, "out")[0];

  const expenseSlices = groupByCategoryCapped(current, "out").map((slice) => ({
    ...slice,
    color: (colorMap.get(slice.name) ?? MUTED_CATEGORY_COLOR).fg,
  }));
  const incomeSlices = groupByCategoryCapped(current, "in").map((slice) => ({
    ...slice,
    color: (colorMap.get(slice.name) ?? MUTED_CATEGORY_COLOR).fg,
  }));

  const evolution = dailySeries(current, start, end);

  const insight = buildReportInsight({
    income: totalIncome,
    expense: totalExpense,
    balance,
    incomePrev: totalIncomePrev,
    expensePrev: totalExpensePrev,
    balancePrev,
    topExpense,
    topExpensePrev,
  });

  const viewQuery = view === "a-vencer" ? "&view=a-vencer" : "";
  const monthQS = monthParam(year, monthIndex);
  const expenseTitle = view === "a-vencer" ? "Despesas a vencer por categoria" : "Despesas por categoria";
  const incomeTitle = view === "a-vencer" ? "Receitas a receber por categoria" : "Receitas por categoria";
  const expenseEmpty = view === "a-vencer" ? "Nenhuma despesa pendente neste mês." : "Nenhuma despesa neste mês.";
  const incomeEmpty = view === "a-vencer" ? "Nenhuma receita pendente neste mês." : "Nenhuma receita neste mês.";
  const isPeriodEmpty = current.length === 0;

  const topCategoryShare = topExpense && totalExpense > 0 ? Math.round((topExpense.amount_cents / totalExpense) * 100) : 0;

  return (
    <div className="flex flex-col gap-6" style={{ background: "#F6F7FB" }}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Relatórios</h1>
          <p className="text-page-subtitle">
            {view === "a-vencer"
              ? "O que ainda vai vencer ou entrar, por categoria — para projetar os próximos meses."
              : "Para onde o dinheiro foi e de onde veio, por categoria."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportViewToggle view={view} />
          <MonthSelector
            label={monthLabel(year, monthIndex)}
            prevHref={`/relatorios?month=${monthParam(prev.year, prev.monthIndex)}${viewQuery}`}
            nextHref={`/relatorios?month=${monthParam(next.year, next.monthIndex)}${viewQuery}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardSurface className="flex min-h-[104px] items-center gap-3.5 p-[18px]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: KPI_TONES.green.bg, color: KPI_TONES.green.fg }}>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block text-[12px] text-(--text-secondary)">Receitas do período</span>
            <span className="mt-0.5 block text-[18px] font-extrabold tabular-nums text-(--text-primary)">
              {formatCents(totalIncome, currency)}
            </span>
            <PercentHelper current={totalIncome} previous={totalIncomePrev} prevLabel={prevLabel} />
          </div>
        </CardSurface>

        <CardSurface className="flex min-h-[104px] items-center gap-3.5 p-[18px]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: KPI_TONES.red.bg, color: KPI_TONES.red.fg }}>
            <TrendingDown className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block text-[12px] text-(--text-secondary)">Despesas do período</span>
            <span className="mt-0.5 block text-[18px] font-extrabold tabular-nums text-(--text-primary)">
              {formatCents(totalExpense, currency)}
            </span>
            <PercentHelper current={totalExpense} previous={totalExpensePrev} prevLabel={prevLabel} />
          </div>
        </CardSurface>

        <CardSurface className="flex min-h-[104px] items-center gap-3.5 p-[18px]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: KPI_TONES.blue.bg, color: KPI_TONES.blue.fg }}>
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block text-[12px] text-(--text-secondary)">Saldo do período</span>
            <span
              className="mt-0.5 block text-[18px] font-extrabold tabular-nums"
              style={{ color: balance < 0 ? "var(--expense)" : "var(--text-primary)" }}
            >
              {formatCents(balance, currency)}
            </span>
            <PercentHelper current={balance} previous={balancePrev} prevLabel={prevLabel} />
          </div>
        </CardSurface>

        <CardSurface className="flex min-h-[104px] items-center gap-3.5 p-[18px]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: KPI_TONES.purple.bg, color: KPI_TONES.purple.fg }}>
            <Tag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block text-[12px] text-(--text-secondary)">Maior categoria</span>
            <span className="mt-0.5 block truncate text-[18px] font-extrabold text-(--text-primary)">
              {topExpense?.name ?? "—"}
            </span>
            <span className="mt-1.5 block text-[11px] text-(--text-secondary)">
              {topExpense ? `${formatCents(topExpense.amount_cents, currency)} (${topCategoryShare}% das despesas)` : "Nenhuma despesa ainda"}
            </span>
          </div>
        </CardSurface>
      </div>

      {isPeriodEmpty ? (
        <CardSurface className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="max-w-[420px] text-sm text-(--text-secondary)">
            Ainda não há dados suficientes neste período. Adicione transações ou altere o mês
            selecionado para visualizar seus relatórios.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/transacoes"
              className="rounded-full px-4 py-2 text-[12px] font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Ir para transações
            </Link>
            <Link
              href={`/relatorios?month=${monthParam(prev.year, prev.monthIndex)}${viewQuery}`}
              className="rounded-full border px-4 py-2 text-[12px] font-semibold text-(--text-secondary)"
              style={{ borderColor: "#E8ECF4" }}
            >
              Mudar período
            </Link>
          </div>
        </CardSurface>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CardSurface className="p-4">
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-extrabold text-(--text-primary)">{expenseTitle}</h2>
                  <p className="mt-0.5 text-[12px] text-(--text-secondary)">
                    Total de {formatCents(totalExpense, currency)} no período
                  </p>
                </div>
                <Link
                  href={`/transacoes?month=${monthQS}&direction=out`}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[12px] font-bold"
                  style={{ borderColor: "#DCE2F3", background: "#F8FAFF", color: "var(--primary)" }}
                >
                  Ver detalhes <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {expenseSlices.length === 0 ? (
                <p className="text-sm text-(--text-muted)">{expenseEmpty}</p>
              ) : (
                <MonthDonut slices={expenseSlices} currency={currency} />
              )}
            </CardSurface>

            <CardSurface className="p-4">
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-extrabold text-(--text-primary)">{incomeTitle}</h2>
                  <p className="mt-0.5 text-[12px] text-(--text-secondary)">
                    Total de {formatCents(totalIncome, currency)} no período
                  </p>
                </div>
                <Link
                  href={`/transacoes?month=${monthQS}&direction=in`}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[12px] font-bold"
                  style={{ borderColor: "#DCE2F3", background: "#F8FAFF", color: "var(--primary)" }}
                >
                  Ver detalhes <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {incomeSlices.length === 0 ? (
                <p className="text-sm text-(--text-muted)">{incomeEmpty}</p>
              ) : (
                <MonthDonut slices={incomeSlices} currency={currency} />
              )}
            </CardSurface>
          </div>

          <CardSurface className="p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-extrabold text-(--text-primary)">Evolução do período</h2>
                <p className="mt-0.5 text-[12px] text-(--text-secondary)">
                  Receitas, despesas e saldo diário em {monthLabel(year, monthIndex)}.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-[11px] text-(--text-secondary)">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#22C55E" }} /> Receitas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#F04469" }} /> Despesas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#3B82F6" }} /> Saldo
                </span>
              </div>
            </div>
            <div
              className="mt-3 rounded-xl px-1 pt-2"
              style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFE 100%)" }}
            >
              <PeriodEvolutionChart points={evolution} currency={currency} />
            </div>
          </CardSurface>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TopCategoriesCard
              expenseRanking={expenseRanking}
              incomeRanking={incomeRanking}
              totalExpense={totalExpense}
              totalIncome={totalIncome}
              currency={currency}
            />
            <InsightVelunCard insight={insight} />
          </div>
        </>
      )}
    </div>
  );
}
