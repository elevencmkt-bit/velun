// Agregações da tela Mês. Princípio 5 da spec vale aqui também: tudo
// deriva de `transactions`, nada é pré-calculado ou guardado.
// Transferências (transfer_group_id preenchido) nunca entram em
// receita/despesa — spec seção 5.

export type MonthTransaction = {
  id: string;
  account_id: string;
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

/** Trecho de frase: texto puro ou um valor em dinheiro (que o "ocultar valores" borra). */
export type InsightPart = string | { cents: number };

export type ReportInsight = {
  headline: InsightPart[];
  tone: "positive" | "warning";
  items: { parts: InsightPart[]; tone: "positive" | "warning" | "info" }[];
};

// Leitura automática do período, comparando com o mês anterior em
// DINHEIRO, não em porcentagem. Porcentagem engana aqui: sobre um mês
// fraco qualquer mês normal vira "+1035%", e sobre saldo negativo a conta
// nem faz sentido ("150% maior" que −$843).
export function buildReportInsight(input: {
  income: number;
  expense: number;
  balance: number;
  incomePrev: number;
  expensePrev: number;
  balancePrev: number;
  topExpense: CategorySlice | undefined;
  topExpensePrev: CategorySlice | undefined;
  /** "agosto" */
  prevName: string;
}): ReportInsight {
  const { income, expense, balance, incomePrev, expensePrev, balancePrev, topExpense, topExpensePrev, prevName } =
    input;

  const hasPrev = incomePrev !== 0 || expensePrev !== 0;
  const items: ReportInsight["items"] = [];

  let headline: InsightPart[];
  let tone: ReportInsight["tone"];
  const diff = balance - balancePrev;
  if (balance < 0) {
    headline = ["Neste mês saiu mais do que entrou: faltaram ", { cents: -balance }, ". Vale revisar os gastos do período."];
    tone = "warning";
  } else if (!hasPrev) {
    headline = ["Sobrou ", { cents: balance }, " neste mês."];
    tone = "positive";
  } else if (diff >= 0) {
    headline = ["Bom mês! Sobrou ", { cents: balance }, ", ", { cents: diff }, ` a mais que em ${prevName}.`];
    tone = "positive";
  } else {
    headline = ["Sobrou ", { cents: balance }, ", ", { cents: -diff }, ` a menos que em ${prevName}.`];
    tone = "warning";
  }

  if (topExpense && expense > 0) {
    const share = Math.round((topExpense.amount_cents / expense) * 100);
    items.push(
      topExpense.name === "Sem categoria"
        ? {
            parts: [`${share}% das despesas estão sem categoria. Categorizar mostra pra onde o dinheiro vai.`],
            tone: "info",
          }
        : {
            parts: [`${topExpense.name} foi sua maior despesa: `, { cents: topExpense.amount_cents }, ` (${share}%).`],
            tone: "info",
          },
    );
  }

  if (hasPrev) {
    const incomeDiff = income - incomePrev;
    if (incomeDiff !== 0) {
      items.push({
        parts: ["Entrou ", { cents: Math.abs(incomeDiff) }, ` ${incomeDiff > 0 ? "a mais" : "a menos"} que em ${prevName}.`],
        tone: incomeDiff > 0 ? "positive" : "warning",
      });
    }

    const expenseDiff = expense - expensePrev;
    if (expenseDiff !== 0) {
      items.push({
        parts: [
          "Você gastou ",
          { cents: Math.abs(expenseDiff) },
          ` ${expenseDiff < 0 ? "a menos" : "a mais"} que em ${prevName}.`,
        ],
        tone: expenseDiff < 0 ? "positive" : "warning",
      });
    }
  }

  if (topExpensePrev && topExpense && topExpensePrev.name !== topExpense.name && topExpensePrev.name !== "Sem categoria") {
    items.push({
      parts: [`${topExpensePrev.name} deixou de ser sua principal categoria de despesa.`],
      tone: "info",
    });
  }

  return { headline, tone, items: items.slice(0, 4) };
}
