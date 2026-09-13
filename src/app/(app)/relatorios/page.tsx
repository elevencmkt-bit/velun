import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents } from "@/lib/money";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { monthRange, shiftMonth, monthParam, monthLabel, parseMonthParam } from "@/lib/month";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import { excludeTransfers, groupByCategory, sumByDirection } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/category-badge";
import { MonthSelector } from "@/components/month-selector";
import { ReportViewToggle, type ReportView } from "./report-view-toggle";
import { MonthDonut } from "../mes/month-donut";

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
  const next = shiftMonth(year, monthIndex, 1);

  const [rows, colorMap] = await Promise.all([
    fetchMonthTransactions(
      supabase,
      householdId,
      start,
      end,
      view === "a-vencer" ? "pending" : "cleared",
    ),
    getCategoryColorMap(supabase, householdId),
  ]);

  const current = excludeTransfers(rows);

  const expenseRanking = groupByCategory(current, "out");
  const incomeRanking = groupByCategory(current, "in");
  const totalExpense = sumByDirection(current, "out");
  const totalIncome = sumByDirection(current, "in");

  const expenseSlices = expenseRanking.map((slice) => ({
    ...slice,
    color: (colorMap.get(slice.name) ?? MUTED_CATEGORY_COLOR).fg,
  }));

  const viewQuery = view === "a-vencer" ? "&view=a-vencer" : "";
  const expenseTitle = view === "a-vencer" ? "Despesas a vencer por categoria" : "Despesas por categoria";
  const incomeTitle = view === "a-vencer" ? "Receitas a receber por categoria" : "Receitas por categoria";
  const expenseEmpty =
    view === "a-vencer" ? "Nenhuma despesa pendente neste mês." : "Nenhuma despesa neste mês.";
  const incomeEmpty =
    view === "a-vencer" ? "Nenhuma receita pendente neste mês." : "Nenhuma receita neste mês.";

  return (
    <div className="flex flex-col gap-8">
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

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-card-title">{expenseTitle}</CardTitle>
            <span className="font-semibold tabular-nums" style={{ color: "var(--expense)" }}>
              {formatCents(totalExpense, currency)}
            </span>
          </CardHeader>
          <CardContent>
            {expenseSlices.length === 0 ? (
              <p className="text-sm text-(--text-muted)">{expenseEmpty}</p>
            ) : (
              <MonthDonut slices={expenseSlices} currency={currency} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-card-title">{incomeTitle}</CardTitle>
            <span className="font-semibold tabular-nums" style={{ color: "var(--income)" }}>
              {formatCents(totalIncome, currency)}
            </span>
          </CardHeader>
          <CardContent>
            {incomeRanking.length === 0 ? (
              <p className="text-sm text-(--text-muted)">{incomeEmpty}</p>
            ) : (
              <div className="flex flex-col">
                {incomeRanking.map((row) => (
                  <div
                    key={row.name}
                    className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 last:border-0"
                  >
                    <CategoryBadge name={row.name} color={colorMap.get(row.name)} />
                    <span className="text-metadata ml-auto">
                      {totalIncome > 0 ? Math.round((row.amount_cents / totalIncome) * 100) : 0}%
                    </span>
                    <span className="w-24 text-right font-semibold tabular-nums text-(--text-primary)">
                      {formatCents(row.amount_cents, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
