import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthTransaction } from "@/lib/reports";
import type { AccountScope } from "@/lib/visibility";

// Transações de um household num intervalo de datas, com conta e
// categoria já resolvidas — usado pelo Dashboard e por Relatórios.
// `status` default "cleared" (realizado); passe "pending" para projeção
// do que ainda vai vencer/entrar em um mês (futuro ou corrente).
export async function fetchMonthTransactions(
  supabase: SupabaseClient,
  householdId: string,
  start: string,
  end: string,
  scope: AccountScope,
  status: "cleared" | "pending" = "cleared",
): Promise<MonthTransaction[]> {
  if (scope.ids.length === 0) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select(
      `id, date, amount_cents, direction, description, transfer_group_id, account_id,
       account:accounts(name),
       category:categories(name)`,
    )
    .eq("household_id", householdId)
    .eq("status", status)
    .in("account_id", scope.ids)
    .gte("date", start)
    .lte("date", end);

  if (error) throw new Error(error.message);

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  return (data ?? []).map((row) => ({
    id: row.id,
    account_id: row.account_id,
    date: row.date,
    amount_cents: row.amount_cents,
    direction: row.direction,
    description: row.description,
    transfer_group_id: row.transfer_group_id,
    account_name: single<{ name: string }>(row.account)?.name ?? "—",
    category_name: single<{ name: string }>(row.category)?.name ?? null,
  }));
}
