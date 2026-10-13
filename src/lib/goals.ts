import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { accountScope } from "@/lib/visibility";
import { getAccountBalances } from "@/lib/balances";
import { monthRange } from "@/lib/month";
import { debtPace, monthEnds, savePace, type Pace } from "@/lib/goal-math";

export { debtPace, elapsedFraction, monthEnds, monthsUntil, savePace } from "@/lib/goal-math";
export type { Pace } from "@/lib/goal-math";

// Metas: o que está guardado no banco é só a meta (nome, alvo, data, o
// que ela segue) e os valores guardados à mão. Progresso, ritmo e quanto
// guardar por mês saem daqui, calculados na hora (princípio 5).

export type { GoalKind } from "@/lib/goal-math";
import type { GoalKind } from "@/lib/goal-math";

export type GoalRow = {
  id: string;
  owner_id: string | null;
  visibility: "hidden" | "shared";
  kind: GoalKind;
  name: string;
  target_cents: number | null;
  target_date: string | null;
  tracking: "deposits" | "account";
  account_id: string | null;
  category_id: string | null;
  start_cents: number;
  created_at: string;
};

export type GoalDeposit = { id: string; goal_id: string; amount_cents: number; date: string; note: string | null };

export type GoalView = GoalRow & {
  /** Do casal, minha ou de quem é. */
  ownerLabel: string;
  canEdit: boolean;
  /** Meta que segue conta que quem vê não enxerga: não mostra números. */
  hidden: boolean;
  accountName: string | null;
  categoryName: string | null;
  deposits: GoalDeposit[];
  // juntar
  savedCents: number;
  // dívida
  remainingCents: number;
  // limite
  spentCents: number;
  /** 0–1+ (limite pode passar de 1). */
  progress: number;
  pace: Pace;
  monthsLeft: number | null;
  /** Quanto guardar/pagar por mês pra chegar na data. */
  perMonthCents: number | null;
  /** Dívida: saldo devedor no fim de cada mês, do começo até hoje. */
  history: { date: string; cents: number }[];
};

// ---------------------------------------------------------------------------
// Carrega as metas que quem está vendo pode ver, já calculadas
// ---------------------------------------------------------------------------

export async function loadGoals(params: {
  supabase: SupabaseClient;
  householdId: string;
  memberId: string;
  today: string;
}): Promise<GoalView[]> {
  const { supabase, householdId, memberId, today } = params;

  const { data: goalRows, error } = await supabase
    // limite: metas de uma casa são poucas
    .from("goals")
    .select(
      "id, owner_id, visibility, kind, name, target_cents, target_date, tracking, account_id, category_id, start_cents, created_at",
    )
    .eq("household_id", householdId)
    .eq("is_archived", false)
    .order("created_at");
  if (error) throw new Error(error.message);
  const goals = (goalRows ?? []) as GoalRow[];
  if (goals.length === 0) return [];

  const [balanceScope, categoriesScope, { data: members }, { data: accounts }, { data: categories }] =
    await Promise.all([
      accountScope(supabase, householdId, memberId, "balance"),
      accountScope(supabase, householdId, memberId, "categories"),
      supabase.from("members").select("id, display_name").eq("household_id", householdId),
      supabase.from("accounts").select("id, name, type").eq("household_id", householdId),
      supabase.from("categories").select("id, name").eq("household_id", householdId),
    ]);

  const goalIds = goals.map((g) => g.id);
  const deposits = await fetchAll<GoalDeposit>((from, to) =>
    supabase
      .from("goal_deposits")
      .select("id, goal_id, amount_cents, date, note")
      .in("goal_id", goalIds)
      .order("date", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const balances = await getAccountBalances(supabase, householdId, balanceScope);
  const visibleBalance = new Set(balanceScope.ids);

  // Limites: gasto confirmado do mês, nas contas que entram nas somas por
  // categoria (as mesmas do relatório), sem transferência.
  const limitCategoryIds = goals.filter((g) => g.kind === "limit" && g.category_id).map((g) => g.category_id!);
  const spentByCategory = new Map<string, number>();
  if (limitCategoryIds.length > 0 && categoriesScope.ids.length > 0) {
    const [y, m] = today.split("-").map(Number);
    const { start, end } = monthRange(y, m - 1);
    const rows = await fetchAll<{ category_id: string; amount_cents: number }>((from, to) =>
      supabase
        .from("transactions")
        .select("category_id, amount_cents")
        .eq("household_id", householdId)
        .eq("status", "cleared")
        .eq("direction", "out")
        .is("transfer_group_id", null)
        .in("account_id", categoriesScope.ids)
        .in("category_id", limitCategoryIds)
        .gte("date", start)
        .lte("date", end)
        .order("id")
        .range(from, to),
    );
    for (const r of rows) spentByCategory.set(r.category_id, (spentByCategory.get(r.category_id) ?? 0) + r.amount_cents);
  }

  // Dívida seguindo conta: saldo no fim de cada mês, pro gráfico.
  const debtAccounts = goals
    .filter((g) => g.kind === "debt" && g.tracking === "account" && g.account_id && visibleBalance.has(g.account_id))
    .map((g) => g.account_id!);
  const accountTx = new Map<string, { date: string; signed: number }[]>();
  const opening = new Map<string, number>();
  if (debtAccounts.length > 0) {
    const [rows, { data: openRows }] = await Promise.all([
      fetchAll<{ account_id: string; date: string; amount_cents: number; direction: "in" | "out" }>((from, to) =>
        supabase
          .from("transactions")
          .select("account_id, date, amount_cents, direction")
          .eq("household_id", householdId)
          .eq("status", "cleared")
          .in("account_id", debtAccounts)
          .order("id")
          .range(from, to),
      ),
      supabase.from("accounts").select("id, opening_balance_cents").in("id", debtAccounts),
    ]);
    for (const r of rows) {
      const list = accountTx.get(r.account_id) ?? [];
      list.push({ date: r.date, signed: r.direction === "in" ? r.amount_cents : -r.amount_cents });
      accountTx.set(r.account_id, list);
    }
    for (const a of openRows ?? []) opening.set(a.id as string, (a.opening_balance_cents as number) ?? 0);
  }

  const memberName = new Map((members ?? []).map((m) => [m.id as string, String(m.display_name).trim().split(/\s+/)[0]]));
  const accountName = new Map((accounts ?? []).map((a) => [a.id as string, a.name as string]));
  const categoryName = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));

  return goals.map((g) => {
    const mine = g.owner_id === memberId;
    const createdOn = g.created_at.slice(0, 10);
    const own = deposits.filter((d) => d.goal_id === g.id);
    const depositSum = own.reduce((n, d) => n + d.amount_cents, 0);
    const followsAccount = g.tracking === "account" && g.account_id !== null;
    const hidden = followsAccount && !visibleBalance.has(g.account_id!);
    const balance = followsAccount ? (balances.get(g.account_id!) ?? 0) : 0;

    const base: GoalView = {
      ...g,
      ownerLabel: g.owner_id === null ? "Do casal" : mine ? "Minha" : `De ${memberName.get(g.owner_id) ?? "outra pessoa"}`,
      canEdit: g.owner_id === null || mine,
      hidden,
      accountName: g.account_id ? (accountName.get(g.account_id) ?? null) : null,
      categoryName: g.category_id ? (categoryName.get(g.category_id) ?? null) : null,
      deposits: own,
      savedCents: 0,
      remainingCents: 0,
      spentCents: 0,
      progress: 0,
      pace: null,
      monthsLeft: null,
      perMonthCents: null,
      history: [],
    };
    if (hidden) return base;

    if (g.kind === "save") {
      const target = g.target_cents ?? 0;
      const saved = followsAccount ? balance : g.start_cents + depositSum;
      return {
        ...base,
        savedCents: saved,
        progress: target > 0 ? Math.max(0, saved / target) : 0,
        ...savePace({ startCents: g.start_cents, savedCents: saved, targetCents: target, createdOn, targetDate: g.target_date, today }),
      };
    }

    if (g.kind === "limit") {
      const spent = g.category_id ? (spentByCategory.get(g.category_id) ?? 0) : 0;
      const limit = g.target_cents ?? 0;
      return { ...base, spentCents: spent, progress: limit > 0 ? spent / limit : 0 };
    }

    // Dívida: cartão tem saldo negativo quando se deve.
    const remaining = followsAccount ? Math.max(0, -balance) : Math.max(0, g.start_cents - depositSum);
    const start = Math.max(g.start_cents, remaining, 1);
    let history: GoalView["history"] = [];
    if (followsAccount) {
      const tx = accountTx.get(g.account_id!) ?? [];
      history = monthEnds(createdOn, today).map((date) => {
        const bal = (opening.get(g.account_id!) ?? 0) + tx.filter((t) => t.date <= date).reduce((n, t) => n + t.signed, 0);
        return { date, cents: Math.max(0, -bal) };
      });
    } else {
      history = monthEnds(createdOn, today).map((date) => ({
        date,
        cents: Math.max(0, g.start_cents - own.filter((d) => d.date <= date).reduce((n, d) => n + d.amount_cents, 0)),
      }));
    }
    history.unshift({ date: createdOn, cents: g.start_cents });
    return {
      ...base,
      remainingCents: remaining,
      progress: Math.min(1, Math.max(0, (start - remaining) / start)),
      history,
      ...debtPace({ startCents: g.start_cents, remainingCents: remaining, createdOn, targetDate: g.target_date, today }),
    };
  });
}
