import type { SupabaseClient } from "@supabase/supabase-js";

// Princípio 5 da spec: nada de saldo mágico — todo saldo deriva das
// transações `cleared`. Soma feita aqui, não guardada em coluna nenhuma.
export async function getAccountBalances(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, number>> {
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, opening_balance_cents")
    .eq("household_id", householdId);

  const balances = new Map<string, number>();
  for (const account of accounts ?? []) {
    balances.set(account.id, account.opening_balance_cents);
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("account_id, amount_cents, direction")
    .eq("household_id", householdId)
    .eq("status", "cleared");

  for (const t of transactions ?? []) {
    const delta = t.direction === "in" ? t.amount_cents : -t.amount_cents;
    balances.set(t.account_id, (balances.get(t.account_id) ?? 0) + delta);
  }

  return balances;
}
