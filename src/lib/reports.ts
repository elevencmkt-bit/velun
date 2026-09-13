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

export function groupExpensesByCategory(rows: MonthTransaction[]): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.direction !== "out") continue;
    const key = row.category_name ?? "Sem categoria";
    totals.set(key, (totals.get(key) ?? 0) + row.amount_cents);
  }

  const slices = Array.from(totals.entries())
    .map(([name, amount_cents]) => ({ name, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents);

  if (slices.length <= MAX_SLICES) return slices;

  const kept = slices.slice(0, MAX_SLICES - 1);
  const rest = slices.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, s) => sum + s.amount_cents, 0);
  return [...kept, { name: OTHER_BUCKET, amount_cents: restTotal }];
}

export function topExpenses(rows: MonthTransaction[], limit: number): MonthTransaction[] {
  return rows
    .filter((r) => r.direction === "out")
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, limit);
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
