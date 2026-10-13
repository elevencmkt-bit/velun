import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { accountScope } from "@/lib/visibility";
import { getAccountBalances } from "@/lib/balances";
import { monthRange } from "@/lib/month";
import { daysBefore, debtPace, monthEnds, projectFinish, savePace, type Pace } from "@/lib/goal-math";

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
  /** Transferência mensal programada (meta que segue conta). */
  schedule: { from_account_id: string; amount_cents: number; day: number; groups: string[] } | null;
};

export type GoalDeposit = {
  id: string;
  goal_id: string;
  amount_cents: number;
  date: string;
  note: string | null;
  /** Vinculado a um lançamento: valor e data vêm dele. */
  transaction_id: string | null;
  /** Descrição e conta do lançamento, quando quem vê enxerga o lançamento. */
  linked: { description: string; account_name: string } | null;
};

/** Lançamento parecido com os já vinculados a uma meta (sugestão). */
export type GoalSuggestion = { id: string; date: string; description: string; account_name: string; amount_cents: number };

export type GoalView = GoalRow & {
  /** Do casal, minha ou de quem é. */
  ownerLabel: string;
  canEdit: boolean;
  /** Meta que segue conta que quem vê não enxerga: não mostra números. */
  hidden: boolean;
  accountName: string | null;
  categoryName: string | null;
  deposits: GoalDeposit[];
  /** "Parece pagamento desta meta": mesmo nome e valor parecido. */
  suggestions: GoalSuggestion[];
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
  /** Valores anotados com data à frente: só contam quando o dia chegar. */
  scheduledCents: number;
  /** Quanto andou por mês, em média, nos últimos 3 meses (null: pouco tempo pra medir). */
  recentRateCents: number | null;
  /** No ritmo recente, em que mês chega lá ("2028-03"). */
  projectedMonth: string | null;
  /** Transferência programada: de onde, quanto, próxima e quantas faltam. */
  plan: { fromName: string; amountCents: number; day: number; next: string | null; remaining: number } | null;
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
      "id, owner_id, visibility, kind, name, target_cents, target_date, tracking, account_id, category_id, start_cents, created_at, schedule",
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
      supabase.from("accounts").select("id, name, type, owner_id").eq("household_id", householdId),
      supabase.from("categories").select("id, name").eq("household_id", householdId),
    ]);

  const goalIds = goals.map((g) => g.id);
  type RawDeposit = {
    id: string;
    goal_id: string;
    amount_cents: number;
    date: string;
    note: string | null;
    transaction_id: string | null;
    tx: RawTx | RawTx[] | null;
  };
  type RawTx = { amount_cents: number; date: string; description: string; account: { name: string } | { name: string }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const rawDeposits = await fetchAll<RawDeposit>((from, to) =>
    supabase
      .from("goal_deposits")
      .select("id, goal_id, amount_cents, date, note, transaction_id, tx:transactions(amount_cents, date, description, account:accounts(name))")
      .in("goal_id", goalIds)
      .order("date", { ascending: false })
      .order("id")
      .range(from, to),
  );
  // Vinculado: o lançamento manda (se ele for editado, a meta acompanha).
  // Se quem vê não enxerga o lançamento, fica o valor guardado na hora.
  const deposits: GoalDeposit[] = rawDeposits
    .map((d) => {
      const tx = one(d.tx);
      return {
        id: d.id,
        goal_id: d.goal_id,
        amount_cents: tx ? tx.amount_cents : d.amount_cents,
        date: tx ? tx.date : d.date,
        note: d.note,
        transaction_id: d.transaction_id,
        linked: tx ? { description: tx.description, account_name: one(tx.account)?.name ?? "" } : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

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

  // Metas que seguem conta: o histórico de saldo da conta serve pro
  // gráfico da dívida e pro ritmo dos últimos 3 meses.
  const debtAccounts = [
    ...new Set(
      goals
        .filter((g) => g.kind !== "limit" && g.tracking === "account" && g.account_id && visibleBalance.has(g.account_id))
        .map((g) => g.account_id!),
    ),
  ];
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

  // Transferências programadas ainda pendentes (a perna que entra na conta da meta).
  const planGroups = goals.flatMap((g) => g.schedule?.groups ?? []);
  const pendingLegs: { transfer_group_id: string; date: string; account_id: string }[] = [];
  if (planGroups.length > 0) {
    const { data } = await supabase
      // limite: no máximo 36 por meta programada
      .from("transactions")
      .select("transfer_group_id, date, account_id")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .eq("direction", "in")
      .in("transfer_group_id", planGroups.slice(0, 300))
      .order("date");
    pendingLegs.push(...((data ?? []) as typeof pendingLegs));
  }

  const memberName = new Map((members ?? []).map((m) => [m.id as string, String(m.display_name).trim().split(/\s+/)[0]]));
  const accountName = new Map((accounts ?? []).map((a) => [a.id as string, a.name as string]));
  const categoryName = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));

  // Sugestões: pra metas por valores registrados que já têm lançamento
  // vinculado, procura nos últimos 60 dias outro lançamento com o MESMO
  // nome e valor até 15% diferente da média dos vinculados. Respeita a
  // regra de conta (meta do casal só com conta do casal).
  const accountOwner = new Map((accounts ?? []).map((a) => [a.id as string, (a.owner_id as string | null) ?? null]));
  const allowedFor = (g: GoalRow) => (accountId: string) => {
    if (!accountOwner.has(accountId)) return false;
    const owner = accountOwner.get(accountId);
    return owner === null || (g.owner_id !== null && owner === memberId);
  };
  const linkedByGoal = new Map<string, GoalDeposit[]>();
  for (const d of deposits) if (d.transaction_id && d.linked) linkedByGoal.set(d.goal_id, [...(linkedByGoal.get(d.goal_id) ?? []), d]);
  const names = [...new Set([...linkedByGoal.values()].flat().map((d) => d.linked!.description))];
  const candidates: { id: string; date: string; description: string; account_id: string; amount_cents: number }[] = [];
  if (names.length > 0) {
    const since = new Date(`${today}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 60);
    const { data } = await supabase
      // limite: 60 dias, só os nomes já vinculados a alguma meta
      .from("transactions")
      .select("id, date, description, account_id, amount_cents")
      .eq("household_id", householdId)
      .eq("status", "cleared")
      .eq("direction", "out")
      .in("description", names.slice(0, 50))
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(200);
    candidates.push(...((data ?? []) as typeof candidates));
  }
  function suggestionsFor(g: GoalRow): GoalSuggestion[] {
    const linked = linkedByGoal.get(g.id);
    if (!linked || g.tracking !== "deposits" || g.kind === "limit") return [];
    if (!(g.owner_id === null || g.owner_id === memberId)) return [];
    const taken = new Set(linked.map((d) => d.transaction_id));
    const wanted = new Set(linked.map((d) => d.linked!.description));
    const avg = linked.reduce((n, d) => n + Math.abs(d.amount_cents), 0) / linked.length;
    const ok = allowedFor(g);
    return candidates
      .filter(
        (t) =>
          !taken.has(t.id) &&
          wanted.has(t.description) &&
          ok(t.account_id) &&
          Math.abs(t.amount_cents - avg) <= avg * 0.15,
      )
      .slice(0, 3)
      .map((t) => ({ id: t.id, date: t.date, description: t.description, account_name: accountName.get(t.account_id) ?? "", amount_cents: t.amount_cents }));
  }

  const d90 = daysBefore(today, 90);
  function balanceOn(accountId: string, date: string) {
    return (opening.get(accountId) ?? 0) + (accountTx.get(accountId) ?? []).filter((t) => t.date <= date).reduce((n, t) => n + t.signed, 0);
  }
  /**
   * Quanto a meta andou por mês nos últimos 3 meses. Conta: variação do
   * saldo. Valores anotados: soma do período ÷ meses (meta com menos de 3
   * semanas ainda não tem ritmo pra medir).
   */
  function recentRate(g: GoalRow, own: GoalDeposit[]): number | null {
    if (g.tracking === "account" && g.account_id) {
      if (!visibleBalance.has(g.account_id) || (!accountTx.has(g.account_id) && !opening.has(g.account_id))) return null;
      const then = balanceOn(g.account_id, d90);
      const now = balanceOn(g.account_id, today);
      const moved = g.kind === "debt" ? Math.max(0, -then) - Math.max(0, -now) : now - then;
      return Math.round(moved / 3);
    }
    const createdOn = g.created_at.slice(0, 10);
    const from = createdOn > d90 ? createdOn : d90;
    const days = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (days < 21) return null;
    const sum = own.filter((d) => d.date > from && d.date <= today).reduce((n, d) => n + d.amount_cents, 0);
    return Math.round(sum / Math.max(1, days / 30.4));
  }
  function planFor(g: GoalRow): GoalView["plan"] {
    if (!g.schedule || !g.account_id) return null;
    const groups = new Set(g.schedule.groups);
    const legs = pendingLegs.filter((l) => groups.has(l.transfer_group_id) && l.account_id === g.account_id);
    return {
      fromName: accountName.get(g.schedule.from_account_id) ?? "outra conta",
      amountCents: g.schedule.amount_cents,
      day: g.schedule.day,
      next: legs[0]?.date ?? null,
      remaining: legs.length,
    };
  }

  return goals.map((g) => {
    const mine = g.owner_id === memberId;
    const createdOn = g.created_at.slice(0, 10);
    const own = deposits.filter((d) => d.goal_id === g.id);
    // Anotado com data à frente ainda não conta: fica como agendado.
    const depositSum = own.filter((d) => d.date <= today).reduce((n, d) => n + d.amount_cents, 0);
    const scheduledCents = own.filter((d) => d.date > today).reduce((n, d) => n + d.amount_cents, 0);
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
      suggestions: suggestionsFor(g),
      scheduledCents,
      recentRateCents: null,
      projectedMonth: null,
      plan: planFor(g),
    };
    if (hidden) return base;

    if (g.kind === "save") {
      const target = g.target_cents ?? 0;
      const saved = followsAccount ? balance : g.start_cents + depositSum;
      const rate = recentRate(g, own);
      return {
        ...base,
        savedCents: saved,
        progress: target > 0 ? Math.max(0, saved / target) : 0,
        recentRateCents: rate,
        projectedMonth: rate !== null ? projectFinish(today, target - saved, rate) : null,
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
    const rate = recentRate(g, own);
    return {
      ...base,
      remainingCents: remaining,
      progress: Math.min(1, Math.max(0, (start - remaining) / start)),
      recentRateCents: rate,
      projectedMonth: rate !== null ? projectFinish(today, remaining, rate) : null,
      history,
      ...debtPace({ startCents: g.start_cents, remainingCents: remaining, createdOn, targetDate: g.target_date, today }),
    };
  });
}
