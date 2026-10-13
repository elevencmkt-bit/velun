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
