// Agregações da tela Mês. Princípio 5 da spec vale aqui também: tudo
// deriva de `transactions`, nada é pré-calculado ou guardado.
// Transferências (transfer_group_id preenchido) nunca entram em
// receita/despesa — spec seção 5.

export type MonthTransaction = {
  id: string;
  date: string;
  amount_cents: number;
  direction: "in" | "out";
  description: string;
  transfer_group_id: string | null;
  category_name: string | null;
  account_name: string;
};

export function excludeTransfers(rows: MonthTransaction[]): MonthTransaction[] {
  return rows.filter((r) => !r.transfer_group_id);
}

export function sumByDirection(rows: MonthTransaction[], direction: "in" | "out"): number {
  return rows.filter((r) => r.direction === direction).reduce((sum, r) => sum + r.amount_cents, 0);
}

const OTHER_BUCKET = "Outras categorias";
const MAX_SLICES = 8;

export type CategorySlice = { name: string; amount_cents: number };

// Ranking por categoria, com no máximo MAX_SLICES fatias — o resto
// agrupado em "Outras categorias". Usado pelos donuts (Mês e
// Relatórios), que perdem legibilidade com muitas fatias finas.
export function groupByCategoryCapped(
  rows: MonthTransaction[],
  direction: "in" | "out",
): CategorySlice[] {
  const slices = groupByCategory(rows, direction);

  if (slices.length <= MAX_SLICES) return slices;

  const kept = slices.slice(0, MAX_SLICES - 1);
  const rest = slices.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, s) => sum + s.amount_cents, 0);
  return [...kept, { name: OTHER_BUCKET, amount_cents: restTotal }];
}

export function groupExpensesByCategory(rows: MonthTransaction[]): CategorySlice[] {
  return groupByCategoryCapped(rows, "out");
}

// Ranking simples por categoria (tela Relatórios) — sem o teto de 8
// fatias do donut, porque aqui é lista, não gráfico.
export function groupByCategory(
  rows: MonthTransaction[],
  direction: "in" | "out",
): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.direction !== direction) continue;
    const key = row.category_name ?? "Sem categoria";
    totals.set(key, (totals.get(key) ?? 0) + row.amount_cents);
  }

  return Array.from(totals.entries())
    .map(([name, amount_cents]) => ({ name, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents);
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export type DailyReportPoint = {
  date: string;
  label: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
};

// Receitas, despesas e saldo líquido de cada dia do mês (não
// acumulado) — série usada pelo gráfico "Evolução do período".
export function dailySeries(rows: MonthTransaction[], start: string, end: string): DailyReportPoint[] {
  const byDate = new Map<string, { income_cents: number; expense_cents: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { income_cents: 0, expense_cents: 0 };
    if (row.direction === "in") entry.income_cents += row.amount_cents;
    else entry.expense_cents += row.amount_cents;
    byDate.set(row.date, entry);
  }

  const points: DailyReportPoint[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    const iso = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(iso) ?? { income_cents: 0, expense_cents: 0 };
    points.push({
      date: iso,
      label: String(cursor.getDate()),
      income_cents: entry.income_cents,
      expense_cents: entry.expense_cents,
      net_cents: entry.income_cents - entry.expense_cents,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export type ReportInsight = {
  headline: string;
  tone: "positive" | "warning";
  items: { text: string; tone: "positive" | "warning" | "info" }[];
};

// Leitura automática do período — mesmo espírito do Insight Velun do
// Fluxo de caixa, aqui comparando o mês atual contra o anterior.
export function buildReportInsight(input: {
  income: number;
  expense: number;
  balance: number;
  incomePrev: number;
  expensePrev: number;
  balancePrev: number;
  topExpense: CategorySlice | undefined;
  topExpensePrev: CategorySlice | undefined;
}): ReportInsight {
  const { income, expense, balance, incomePrev, expensePrev, balancePrev, topExpense, topExpensePrev } =
    input;

  const balanceChange = percentChange(balance, balancePrev);
  const items: ReportInsight["items"] = [];

  let headline: string;
  let tone: ReportInsight["tone"];
  if (balanceChange === null) {
    headline = "Ainda não há mês anterior para comparar o saldo.";
    tone = "positive";
  } else if (balanceChange >= 0) {
    headline = `Ótimo resultado! Seu saldo foi ${Math.abs(balanceChange).toFixed(0)}% maior que no mês anterior. Continue assim.`;
    tone = "positive";
  } else {
    headline = `Seu saldo caiu ${Math.abs(balanceChange).toFixed(0)}% em relação ao mês anterior. Vale revisar os gastos do período.`;
    tone = "warning";
  }

  if (topExpense) {
    const share = expense > 0 ? Math.round((topExpense.amount_cents / expense) * 100) : 0;
    items.push({
      text: `${topExpense.name} ainda é sua maior despesa (${share}%). Considere revisar esses gastos se quiser aumentar sua reserva.`,
      tone: "warning",
    });
  }

  const incomeChange = percentChange(income, incomePrev);
  if (incomeChange !== null) {
    items.push({
      text:
        incomeChange >= 0
          ? `Suas receitas cresceram ${incomeChange.toFixed(0)}% em relação ao mês anterior.`
          : `Suas receitas caíram ${Math.abs(incomeChange).toFixed(0)}% em relação ao mês anterior.`,
      tone: incomeChange >= 0 ? "positive" : "warning",
    });
  }

  const expenseChange = percentChange(expense, expensePrev);
  if (expenseChange !== null) {
    items.push({
      text:
        expenseChange < 0
          ? `Você gastou ${Math.abs(expenseChange).toFixed(0)}% a menos neste período. Uma ótima evolução no seu controle financeiro!`
          : `Suas despesas subiram ${expenseChange.toFixed(0)}% em relação ao mês anterior.`,
      tone: expenseChange < 0 ? "positive" : "warning",
    });
  }

  if (topExpensePrev && topExpense && topExpensePrev.name !== topExpense.name) {
    items.push({
      text: `${topExpensePrev.name} deixou de ser sua principal categoria de despesa neste período.`,
      tone: "info",
    });
  }

  return { headline, tone, items: items.slice(0, 4) };
}
