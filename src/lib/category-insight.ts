// Frase curta do painel da categoria: o lançamento mais caro e, quando
// um lugar só pesa muito, quanto ele soma. Pura, pra testar.

export type InsightRow = { date: string; description: string; amount_cents: number };

export type CategoryInsight = {
  top: InsightRow | null;
  /** Lugar que concentra o mês (2+ lançamentos e 40%+ do total). */
  heavy: { description: string; cents: number; share: number; count: number } | null;
};

export function categoryInsight(rows: InsightRow[]): CategoryInsight {
  if (rows.length === 0) return { top: null, heavy: null };
  const top = rows.reduce((a, b) => (b.amount_cents > a.amount_cents ? b : a));
  const total = rows.reduce((n, r) => n + r.amount_cents, 0);

  const by = new Map<string, { cents: number; count: number }>();
  for (const r of rows) {
    const k = r.description.trim();
    const cur = by.get(k) ?? { cents: 0, count: 0 };
    by.set(k, { cents: cur.cents + r.amount_cents, count: cur.count + 1 });
  }
  let heavy: CategoryInsight["heavy"] = null;
  for (const [description, { cents, count }] of by) {
    const share = total > 0 ? cents / total : 0;
    if (count >= 2 && share >= 0.4 && (!heavy || cents > heavy.cents)) {
      heavy = { description, cents, share, count };
    }
  }
  return { top: rows.length > 1 ? top : null, heavy };
}
