import type { SupabaseClient } from "@supabase/supabase-js";
import { accountScope } from "@/lib/visibility";
import { getCashFlowProjection, withoutInvestments } from "@/lib/cash-flow";
import { loadSpendingEstimate } from "@/lib/spending-limits";
import { loadCashFloor } from "@/lib/cash-floor";
import { computeFreeThisWeek, FREE_LOOKAHEAD_DAYS, type FreeThisWeek } from "@/lib/free-this-week";

/**
 * "Livre esta semana" de quem está vendo: as contas que entram no saldo
 * dela, sem as de investimento, com os gastos estimados e o piso.
 */
export async function loadFreeThisWeek(params: {
  supabase: SupabaseClient;
  householdId: string;
  memberId: string;
  today: string;
}): Promise<FreeThisWeek | null> {
  const { supabase, householdId, memberId, today } = params;
  const full = await accountScope(supabase, householdId, memberId, "balance");
  if (full.ids.length === 0) return null;
  const { data: accounts } = await supabase
    // limite: contas de uma casa, poucas dezenas
    .from("accounts")
    .select("id, type")
    .eq("household_id", householdId)
    .in("id", full.ids);
  const scope = withoutInvestments(full, (accounts ?? []) as { id: string; type: string }[]);
  if (scope.ids.length === 0) return null;

  const [projection, estimate, floor] = await Promise.all([
    getCashFlowProjection(supabase, householdId, FREE_LOOKAHEAD_DAYS, scope, today),
    loadSpendingEstimate({ supabase, householdId, memberId, today, horizonDays: FREE_LOOKAHEAD_DAYS }),
    loadCashFloor(supabase, householdId, memberId),
  ]);

  return computeFreeThisWeek({
    today,
    availableCents: projection.currentTotal,
    events: projection.upcomingEvents,
    estimateByDate: estimate.byDate,
    floorCents: floor.cents,
    overdueOutCents: projection.overdue.outCents,
  });
}
