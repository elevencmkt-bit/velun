import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountScope } from "@/lib/visibility";

// Princípio 5 da spec: nada de saldo mágico — todo saldo deriva das
// transações `cleared`. Soma feita aqui, não guardada em coluna nenhuma.
// É isso que torna o nível `hidden` seguro: não existe saldo materializado
// em lugar nenhum pra vazar.
//
// `scope` vem de accountScope(..., "balance") e é obrigatório de propósito:
// com ele no parâmetro, o compilador aponta todo ponto de chamada que
// precisa decidir de quem é a visão sendo calculada.
export async function getAccountBalances(
  supabase: SupabaseClient,
  householdId: string,
  scope: AccountScope,
): Promise<Map<string, number>> {
  if (scope.ids.length === 0) return new Map();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, opening_balance_cents")
    .eq("household_id", householdId)
    .in("id", scope.ids);

  const balances = new Map<string, number>();
  for (const account of accounts ?? []) {
    balances.set(account.id, account.opening_balance_cents);
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("account_id, amount_cents, direction")
    .eq("household_id", householdId)
    .eq("status", "cleared")
    .in("account_id", scope.ids);

  for (const t of transactions ?? []) {
    const delta = t.direction === "in" ? t.amount_cents : -t.amount_cents;
    balances.set(t.account_id, (balances.get(t.account_id) ?? 0) + delta);
  }

  return balances;
}
