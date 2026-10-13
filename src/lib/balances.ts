import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
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

  // Em páginas: o Supabase corta cada consulta em 1000 linhas, e uma
  // conta com um ano de extrato já passa disso — o saldo sairia errado
  // sem aviso.
  const transactions = await fetchAll<{
    account_id: string;
    amount_cents: number;
    direction: "in" | "out";
  }>((from, to) =>
    supabase
      .from("transactions")
      .select("account_id, amount_cents, direction")
      .eq("household_id", householdId)
      .eq("status", "cleared")
      .in("account_id", scope.ids)
      .order("id")
      .range(from, to),
  );

  for (const t of transactions) {
    const delta = t.direction === "in" ? t.amount_cents : -t.amount_cents;
    balances.set(t.account_id, (balances.get(t.account_id) ?? 0) + delta);
  }

  return balances;
}
