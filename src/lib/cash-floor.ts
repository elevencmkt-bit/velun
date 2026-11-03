import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Metas que formam o piso automático: o colchão contra o cheque especial
 * e a reserva de impostos. Vale pelo nome (acento opcional).
 */
export const FLOOR_GOAL_NAME = /colch[aã]o|reserva\s+(?:de|p\/|pra|para)?\s*impostos?/i;

export type CashFloor = {
  /** O piso que vale (0 = sem piso: a linha e o KPI somem). */
  cents: number;
  /** De onde veio: valor fixo em Configurações, soma das metas, ou nenhum. */
  source: "manual" | "goals" | "none";
  /** Soma das metas do piso (o automático), pra mostrar em Configurações. */
  goalsCents: number;
  goals: { name: string; cents: number }[];
};

/**
 * Piso de segurança da casa. Sem valor em Configurações, é a soma dos
 * alvos das metas de juntar "Colchão" e "Reserva de impostos" que quem
 * está vendo enxerga. Com valor, vale o valor (0 desliga).
 */
export async function loadCashFloor(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string,
): Promise<CashFloor> {
  const [{ data: household }, { data: goalRows }] = await Promise.all([
    supabase.from("households").select("cash_floor_cents").eq("id", householdId).maybeSingle(),
    supabase
      // limite: metas de uma casa são poucas
      .from("goals")
      .select("name, target_cents")
      .eq("household_id", householdId)
      .eq("kind", "save")
      .eq("is_archived", false)
      .or(`owner_id.is.null,owner_id.eq.${memberId},visibility.eq.shared`),
  ]);
  const goals = ((goalRows ?? []) as { name: string; target_cents: number | null }[])
    .filter((g) => FLOOR_GOAL_NAME.test(g.name) && (g.target_cents ?? 0) > 0)
    .map((g) => ({ name: g.name, cents: g.target_cents as number }));
  const goalsCents = goals.reduce((n, g) => n + g.cents, 0);

  const manual = (household?.cash_floor_cents as number | null | undefined) ?? null;
  if (manual !== null) return { cents: manual, source: manual > 0 ? "manual" : "none", goalsCents, goals };
  return { cents: goalsCents, source: goalsCents > 0 ? "goals" : "none", goalsCents, goals };
}
