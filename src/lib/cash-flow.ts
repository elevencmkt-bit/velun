import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountBalances } from "@/lib/balances";

export type CashFlowPoint = { date: string; label: string; balance_cents: number };

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

// Saldo atual + pendentes projetado dia a dia — mesma lógica usada pela
// tela Fluxo de caixa e pelo card-resumo do Dashboard, só o horizonte muda.
export async function getCashFlowProjection(
  supabase: SupabaseClient,
  householdId: string,
  horizonDays: number,
) {
  const today = new Date(new Date().toDateString());
  const horizon = addDays(today, horizonDays);

  const [balances, { data: pending }] = await Promise.all([
    getAccountBalances(supabase, householdId),
    supabase
      .from("transactions")
      .select("date, amount_cents, direction")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .gte("date", toISO(today))
      .lte("date", toISO(horizon)),
  ]);

  const currentTotal = Array.from(balances.values()).reduce((sum, v) => sum + v, 0);

  const deltaByDate = new Map<string, number>();
  for (const row of pending ?? []) {
    const delta = row.direction === "in" ? row.amount_cents : -row.amount_cents;
    deltaByDate.set(row.date, (deltaByDate.get(row.date) ?? 0) + delta);
  }

  const points: CashFlowPoint[] = [];
  let running = currentTotal;
  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const iso = toISO(d);
    running += deltaByDate.get(iso) ?? 0;
    points.push({
      date: iso,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      balance_cents: running,
    });
  }

  const lowestPoint = points.reduce((min, p) => (p.balance_cents < min.balance_cents ? p : min));
  const finalPoint = points[points.length - 1];

  return { points, currentTotal, lowestPoint, finalPoint };
}
