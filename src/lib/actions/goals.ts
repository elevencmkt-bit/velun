"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { getAccountBalances } from "@/lib/balances";
import type { GoalKind } from "@/lib/goal-math";

type Result = { ok: true } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function done(): Result {
  revalidatePath("/metas");
  return { ok: true };
}

export type NewGoal = {
  kind: GoalKind;
  name: string;
  targetCents: number | null;
  targetDate: string | null;
  tracking: "deposits" | "account";
  accountId: string | null;
  categoryId: string | null;
  /** Juntar por depósitos: quanto já tem; dívida manual: quanto deve hoje. */
  startCents: number;
  mine: boolean;
  shared: boolean;
};

export async function createGoal(input: NewGoal): Promise<Result> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Dê um nome pra meta." };
  if (input.targetDate && !DATE.test(input.targetDate)) return { ok: false, error: "Data inválida." };

  const kind = input.kind;
  const followsAccount = kind !== "limit" && input.tracking === "account";
  if (kind === "limit" && !input.categoryId) return { ok: false, error: "Escolha a categoria." };
  if (kind !== "debt" && !(input.targetCents && input.targetCents > 0)) {
    return { ok: false, error: kind === "limit" ? "Quanto é o limite por mês?" : "Quanto quer juntar?" };
  }
  if (followsAccount && !input.accountId) return { ok: false, error: "Escolha a conta." };

  // Ponto de partida: o saldo da conta agora (pra medir o ritmo), ou o que
  // a pessoa informou.
  let start = Math.max(0, Math.round(input.startCents || 0));
  if (followsAccount) {
    const scope = await accountScope(supabase, householdId, memberId, "balance");
    if (!scope.ids.includes(input.accountId!)) return { ok: false, error: "Conta não encontrada." };
    const balance =
      (await getAccountBalances(supabase, householdId, { ids: [input.accountId!], excludedCount: 0 })).get(
        input.accountId!,
      ) ?? 0;
    start = kind === "debt" ? Math.max(0, -balance) : balance;
  }
  if (kind === "debt" && start <= 0) {
    return {
      ok: false,
      error: followsAccount ? "Essa conta não tem dívida agora." : "Quanto deve hoje?",
    };
  }

  const { error } = await supabase.from("goals").insert({
    household_id: householdId,
    owner_id: input.mine ? memberId : null,
    visibility: input.mine && input.shared ? "shared" : "hidden",
    kind,
    name,
    target_cents: kind === "debt" ? null : input.targetCents,
    target_date: kind === "limit" ? null : input.targetDate,
    tracking: kind === "limit" ? "deposits" : input.tracking,
    account_id: followsAccount ? input.accountId : null,
    category_id: kind === "limit" ? input.categoryId : null,
    start_cents: kind === "limit" ? 0 : start,
    created_by: memberId,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("row-level security")
        ? "Meta do casal só pode seguir conta do casal."
        : error.message,
    };
  }
  return done();
}

export async function updateGoal(
  id: string,
  input: { name: string; targetCents: number | null; targetDate: string | null; shared: boolean },
): Promise<Result> {
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Dê um nome pra meta." };
  if (input.targetDate && !DATE.test(input.targetDate)) return { ok: false, error: "Data inválida." };

  const { data: goal } = await supabase.from("goals").select("kind, owner_id").eq("id", id).maybeSingle();
  if (!goal) return { ok: false, error: "Meta não encontrada." };
  if (goal.kind !== "debt" && !(input.targetCents && input.targetCents > 0)) {
    return { ok: false, error: "Informe o valor." };
  }

  const { data, error } = await supabase
    .from("goals")
    .update({
      name,
      target_cents: goal.kind === "debt" ? null : input.targetCents,
      target_date: goal.kind === "limit" ? null : input.targetDate,
      visibility: goal.owner_id && input.shared ? "shared" : "hidden",
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Você não pode mudar essa meta." };
  return done();
}

export async function deleteGoal(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Você não pode apagar essa meta." };
  return done();
}

export async function addGoalDeposit(input: {
  goalId: string;
  amountCents: number;
  date: string;
  note?: string;
}): Promise<Result> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();
  const amount = Math.round(input.amountCents);
  if (!amount) return { ok: false, error: "Informe o valor." };
  if (!DATE.test(input.date)) return { ok: false, error: "Data inválida." };

  const { data, error } = await supabase
    .from("goal_deposits")
    .insert({
      household_id: householdId,
      goal_id: input.goalId,
      amount_cents: amount,
      date: input.date,
      note: input.note?.trim() || null,
      created_by: memberId,
    })
    .select("id");
  if (error) {
    return {
      ok: false,
      error: error.message.includes("row-level security") ? "Você não pode mexer nessa meta." : error.message,
    };
  }
  if (!data || data.length === 0) return { ok: false, error: "Você não pode mexer nessa meta." };
  return done();
}

export async function deleteGoalDeposit(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goal_deposits").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Você não pode apagar esse valor." };
  return done();
}

export type LinkableTransaction = {
  id: string;
  date: string;
  description: string;
  account_name: string;
  amount_cents: number;
  direction: "in" | "out";
};

/**
 * Lançamentos que dá pra vincular a uma meta: das contas que a meta pode
 * usar (meta do casal: só conta do casal; minha: do casal ou minha), dos
 * últimos 6 meses, que ainda não estão nela. Busca opcional pelo texto.
 */
export async function findLinkableTransactions(goalId: string, query: string): Promise<LinkableTransaction[]> {
  const { householdId, memberId, today } = await getCurrentMember();
  const supabase = await createClient();

  const { data: goal } = await supabase.from("goals").select("owner_id, kind").eq("id", goalId).maybeSingle();
  if (!goal || (goal.owner_id !== null && goal.owner_id !== memberId)) return [];

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, owner_id")
    .eq("household_id", householdId);
  const allowed = (accounts ?? []).filter((a) =>
    goal.owner_id === null ? a.owner_id === null : a.owner_id === null || a.owner_id === memberId,
  );
  if (allowed.length === 0) return [];
  const names = new Map(allowed.map((a) => [a.id as string, a.name as string]));

  const { data: used } = await supabase
    // limite: valores de uma meta só
    .from("goal_deposits")
    .select("transaction_id")
    .eq("goal_id", goalId)
    .not("transaction_id", "is", null);
  const taken = new Set((used ?? []).map((u) => u.transaction_id as string));

  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCMonth(since.getUTCMonth() - 6);
  let q = supabase
    // limite: os 40 mais recentes que batem com a busca
    .from("transactions")
    .select("id, date, description, amount_cents, direction, account_id")
    .eq("household_id", householdId)
    .eq("status", "cleared")
    .in("account_id", [...names.keys()])
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .order("id")
    .limit(40);
  const term = query.trim();
  if (term) {
    const cents = Math.round(Number.parseFloat(term.replace(/[^\d.,]/g, "").replace(",", ".")) * 100);
    const safe = `"%${term.replace(/["\\]/g, "")}%"`;
    q = Number.isFinite(cents) && cents > 0 && /^[\d.,$\s]+$/.test(term)
      ? q.eq("amount_cents", cents)
      : q.or(`description.ilike.${safe},bank_description.ilike.${safe}`);
  } else {
    // Sem busca, o que mais costuma ser pagamento/depósito: saídas.
    q = q.eq("direction", "out");
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((t) => !taken.has(t.id as string))
    .map((t) => ({
      id: t.id as string,
      date: t.date as string,
      description: t.description as string,
      account_name: names.get(t.account_id as string) ?? "",
      amount_cents: t.amount_cents as number,
      direction: t.direction as "in" | "out",
    }));
}

/** Vincula um lançamento: entra na meta com o valor e a data dele. */
export async function linkTransactionToGoal(goalId: string, transactionId: string): Promise<Result> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("transactions")
    .select("amount_cents, date")
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx) return { ok: false, error: "Lançamento não encontrado." };

  const { data, error } = await supabase
    .from("goal_deposits")
    .insert({
      household_id: householdId,
      goal_id: goalId,
      amount_cents: tx.amount_cents,
      date: tx.date,
      transaction_id: transactionId,
      created_by: memberId,
    })
    .select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esse lançamento já está nesta meta." };
    return {
      ok: false,
      error: error.message.includes("row-level security")
        ? "Meta do casal só aceita lançamento de conta do casal."
        : error.message,
    };
  }
  if (!data || data.length === 0) return { ok: false, error: "Você não pode mexer nessa meta." };
  return done();
}
