import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { accountScope } from "@/lib/visibility";
import { monthRange } from "@/lib/month";
import { addDaysISO } from "@/lib/today";
import { estimateSpending, type SpendingEstimate, type SpendingLimit } from "@/lib/cash-flow-estimates";

/**
 * Gastos estimados do Fluxo de caixa, a partir dos limites de gasto das
 * Metas que quem está vendo enxerga. O gasto e o previsto contam as
 * mesmas contas dos limites (as que entram nas somas por categoria), sem
 * transferência, e a categoria do limite junto com as subcategorias dela.
 */
export async function loadSpendingEstimate(params: {
  supabase: SupabaseClient;
  householdId: string;
  memberId: string;
  today: string;
  horizonDays: number;
}): Promise<SpendingEstimate> {
  const { supabase, householdId, memberId, today, horizonDays } = params;
  const empty: SpendingEstimate = { byDate: new Map(), categories: [], totalCents: 0 };

  const [{ data: goalRows }, { data: categoryRows }, scope] = await Promise.all([
    supabase
      // limite: metas de uma casa são poucas
      .from("goals")
      .select("category_id, target_cents")
      .eq("household_id", householdId)
      .eq("kind", "limit")
      .eq("is_archived", false)
      .or(`owner_id.is.null,owner_id.eq.${memberId},visibility.eq.shared`),
    // limite: categorias de uma casa, poucas dezenas
    supabase.from("categories").select("id, name, parent_id").eq("household_id", householdId),
    accountScope(supabase, householdId, memberId, "categories"),
  ]);

  const categories = (categoryRows ?? []) as { id: string; name: string; parent_id: string | null }[];
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  // Um limite por categoria (o maior, se houver dois). Limite numa
  // subcategoria cuja mãe também tem limite: a mãe já cobre.
  const byCategory = new Map<string, number>();
  for (const g of (goalRows ?? []) as { category_id: string | null; target_cents: number | null }[]) {
    if (!g.category_id || !g.target_cents) continue;
    byCategory.set(g.category_id, Math.max(byCategory.get(g.category_id) ?? 0, g.target_cents));
  }
  const limits: SpendingLimit[] = [...byCategory.entries()]
    .filter(([id]) => {
      const parent = parentOf.get(id);
      return !(parent && byCategory.has(parent));
    })
    .map(([id, cents]) => ({ categoryId: id, name: nameOf.get(id) ?? "Categoria", limitCents: cents }));
  if (limits.length === 0 || scope.ids.length === 0) return empty;

  // Categoria de cada lançamento → a do limite que a cobre.
  const limitIds = new Set(limits.map((l) => l.categoryId));
  const coveredBy = new Map<string, string>();
  for (const c of categories) {
    if (limitIds.has(c.id)) coveredBy.set(c.id, c.id);
    else if (c.parent_id && limitIds.has(c.parent_id)) coveredBy.set(c.id, c.parent_id);
  }
  const coveredIds = [...coveredBy.keys()];

  const [y, m] = today.split("-").map(Number);
  const { start } = monthRange(y, m - 1);
  const horizon = addDaysISO(today, horizonDays);
  // Previsto até o fim do mês do horizonte: o mês todo conta pra não
  // estimar em dobro o que já está lançado mais pro fim dele.
  const [hy, hm] = horizon.split("-").map(Number);
  const { end: horizonMonthEnd } = monthRange(hy, hm - 1);

  const [spentRows, plannedRows] = await Promise.all([
    fetchAll<{ category_id: string; amount_cents: number }>((from, to) =>
      supabase
        .from("transactions")
        .select("category_id, amount_cents")
        .eq("household_id", householdId)
        .eq("status", "cleared")
        .eq("direction", "out")
        .is("transfer_group_id", null)
        .in("account_id", scope.ids)
        .in("category_id", coveredIds)
        .gte("date", start)
        .lte("date", today)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ category_id: string; amount_cents: number; date: string }>((from, to) =>
      supabase
        .from("transactions")
        .select("category_id, amount_cents, date")
        .eq("household_id", householdId)
        .eq("status", "pending")
        .eq("direction", "out")
        .is("transfer_group_id", null)
        .in("account_id", scope.ids)
        .in("category_id", coveredIds)
        .gte("date", today)
        .lte("date", horizonMonthEnd)
        .order("id")
        .range(from, to),
    ),
  ]);

  const spentThisMonth = new Map<string, number>();
  for (const r of spentRows) {
    const key = coveredBy.get(r.category_id);
    if (key) spentThisMonth.set(key, (spentThisMonth.get(key) ?? 0) + r.amount_cents);
  }
  const planned = new Map<string, number>();
  for (const r of plannedRows) {
    const key = coveredBy.get(r.category_id);
    if (!key) continue;
    const k = `${key}|${r.date.slice(0, 7)}`;
    planned.set(k, (planned.get(k) ?? 0) + r.amount_cents);
  }

  return estimateSpending({ limits, spentThisMonth, planned, today, horizonDays });
}
