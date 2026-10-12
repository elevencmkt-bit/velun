import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIRMED_WINDOW_DAYS, type ConfirmedCandidate } from "@/lib/import/match-confirmed";

function shiftDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Lançamentos confirmados à mão na conta, em volta do período do
 * extrato — os que o extrato pode estar trazendo de novo com outro nome.
 *
 * Usado na importação (pra sugerir junção) e na tela de revisão (pra
 * avisar dos ambíguos), então mora aqui e não num arquivo de ações.
 *
 * Fica de fora:
 * - o que veio de importação (`import_id`): esses a impressão digital
 *   já reconhece como duplicata;
 * - previsão (`pending`): tem cruzamento próprio;
 * - perna de transferência (`transfer_group_id`): a junção mudaria data
 *   e valor de uma perna só, e a transferência ficaria com as duas
 *   pontas desencontradas.
 */
export async function fetchConfirmedCandidates(
  supabase: SupabaseClient,
  householdId: string,
  accountId: string,
  period: { periodStart: string; periodEnd: string },
): Promise<(ConfirmedCandidate & { description: string })[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, amount_cents, direction, fingerprint, description")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("status", "cleared")
    .is("import_id", null)
    .is("transfer_group_id", null)
    .gte("date", shiftDays(period.periodStart, -CONFIRMED_WINDOW_DAYS))
    .lte("date", shiftDays(period.periodEnd, CONFIRMED_WINDOW_DAYS))
    .order("date");

  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    amountCents: t.amount_cents as number,
    direction: t.direction as "in" | "out",
    fingerprint: t.fingerprint as string,
    description: t.description as string,
  }));
}
