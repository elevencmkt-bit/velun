import { accountScope } from "@/lib/visibility";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import { excludeTransfers, groupByCategory, sumByDirection, type MonthTransaction } from "@/lib/reports";
import { loadGoals, type GoalView } from "@/lib/goals";
import { cardBills, loadCards } from "@/lib/cards";
import { getCategoryColorMap } from "@/lib/category-colors";
import { addDaysISO } from "@/lib/today";
import type { EmailContext } from "./context";
import { daysBetween, monthBounds, previousMonth } from "./format";

// Fechamento do mês: o que entrou e saiu, conta por conta, onde foi o
// dinheiro, as metas e o que já está previsto pro mês novo.
// Somas seguem o relatório (nível "categorias"); o previsto segue A vencer.

export type MonthAccount = {
  id: string;
  name: string;
  card: boolean;
  startCents: number;
  endCents: number;
  inCents: number;
  outCents: number;
  /** Dias do mês que terminaram com a conta negativa (só conta em dinheiro). */
  negativeDays: number;
};

export type MonthCategory = { name: string; cents: number; prevCents: number | null; color?: string };

export type MonthGoal = {
  name: string;
  kind: "save" | "limit" | "debt";
  /** "$3,200 de $10,000" etc. — montado no render. */
  currentCents: number;
  targetCents: number | null;
  progress: number;
  /** Juntar: quanto entrou na meta no mês. */
  monthCents: number;
  over: boolean;
};

export type MonthSummary = {
  month: string;
  prevMonth: string;
  inCents: number;
  outCents: number;
  prevInCents: number;
  prevOutCents: number;
  hasPrev: boolean;
  accounts: MonthAccount[];
  categories: MonthCategory[];
  otherCategories: { count: number; cents: number };
  goals: MonthGoal[];
  next: { outCents: number; inCents: number; count: number };
  /** Lançamentos confirmados no mês, fora transferências (0 = nada pra resumir). */
  count: number;
  /** Contas pessoais do outro que ficaram fora das somas. */
  excludedCount: number;
};

const TOP_CATEGORIES = 5;
const MAX_GOALS = 4;

export function buildMonth(input: {
  month: string;
  rows: MonthTransaction[];
  prevRows: MonthTransaction[];
  accounts: Omit<MonthAccount, "inCents" | "outCents">[];
  goals: MonthGoal[];
  next: MonthSummary["next"];
  excludedCount?: number;
}): MonthSummary {
  const current = excludeTransfers(input.rows);
  const previous = excludeTransfers(input.prevRows);

  const accounts = input.accounts
    .map((a) => {
      const own = current.filter((r) => r.account_id === a.id);
      return { ...a, inCents: sumByDirection(own, "in"), outCents: sumByDirection(own, "out") };
    })
    // Conta zerada e parada no mês não precisa de linha.
    .filter((a) => a.inCents !== 0 || a.outCents !== 0 || a.endCents !== 0 || a.startCents !== 0);

  const slices = groupByCategory(current, "out");
  const prevByName = new Map(groupByCategory(previous, "out").map((s) => [s.name, s.amount_cents]));
  const hasPrev = previous.length > 0;
  const categories = slices.slice(0, TOP_CATEGORIES).map((s) => ({
    name: s.name,
    cents: s.amount_cents,
    prevCents: hasPrev ? (prevByName.get(s.name) ?? 0) : null,
  }));
  const rest = slices.slice(TOP_CATEGORIES);

  return {
    month: input.month,
    prevMonth: previousMonth(input.month),
    inCents: sumByDirection(current, "in"),
    outCents: sumByDirection(current, "out"),
    prevInCents: sumByDirection(previous, "in"),
    prevOutCents: sumByDirection(previous, "out"),
    hasPrev,
    accounts,
    categories,
    otherCategories: { count: rest.length, cents: rest.reduce((s, r) => s + r.amount_cents, 0) },
    goals: input.goals.slice(0, MAX_GOALS),
    next: input.next,
    count: current.length,
    excludedCount: input.excludedCount ?? 0,
  };
}

/** Saldo de cada conta no fim de cada dia do mês, a partir dos confirmados. */
export function accountBalancesInMonth(input: {
  month: string;
  accounts: { id: string; name: string; card: boolean; openingCents: number }[];
  cleared: { account_id: string; date: string; amount_cents: number; direction: "in" | "out" }[];
}): Omit<MonthAccount, "inCents" | "outCents">[] {
  const { start, end } = monthBounds(input.month);
  const days = daysBetween(start, end);
  return input.accounts.map((a) => {
    const own = input.cleared.filter((t) => t.account_id === a.id && t.date <= end);
    const signed = (t: (typeof own)[number]) => (t.direction === "in" ? t.amount_cents : -t.amount_cents);
    const startCents = a.openingCents + own.filter((t) => t.date < start).reduce((s, t) => s + signed(t), 0);
    const perDay = new Map<string, number>();
    for (const t of own) if (t.date >= start) perDay.set(t.date, (perDay.get(t.date) ?? 0) + signed(t));
    let running = startCents;
    let negativeDays = 0;
    for (const d of days) {
      running += perDay.get(d) ?? 0;
      if (!a.card && running < 0) negativeDays += 1;
    }
    return { id: a.id, name: a.name, card: a.card, startCents, endCents: running, negativeDays };
  });
}

export function goalLines(goals: GoalView[], memberId: string, month: string): MonthGoal[] {
  const { start, end } = monthBounds(month);
  return goals
    .filter((g) => !g.hidden && (g.owner_id === null || g.owner_id === memberId || g.visibility === "shared"))
    .map((g): MonthGoal => {
      if (g.kind === "limit") {
        return {
          name: g.name,
          kind: "limit",
          currentCents: g.spentCents,
          targetCents: g.target_cents,
          progress: g.progress,
          monthCents: 0,
          over: g.target_cents !== null && g.spentCents > g.target_cents,
        };
      }
      if (g.kind === "debt") {
        return {
          name: g.name,
          kind: "debt",
          currentCents: g.remainingCents,
          targetCents: null,
          progress: g.progress,
          monthCents: 0,
          over: false,
        };
      }
      const monthCents = g.deposits
        .filter((d) => d.date >= start && d.date <= end)
        .reduce((s, d) => s + d.amount_cents, 0);
      return {
        name: g.name,
        kind: "save",
        currentCents: g.savedCents,
        targetCents: g.target_cents,
        progress: g.progress,
        monthCents,
        over: false,
      };
    });
}

export async function loadMonth(ctx: EmailContext, month: string): Promise<MonthSummary> {
  const { supabase, householdId, memberId } = ctx;
  const prev = previousMonth(month);
  const { start, end } = monthBounds(month);
  const prevBounds = monthBounds(prev);
  const nextStart = addDaysISO(end, 1);
  const nextEnd = monthBounds(nextStart.slice(0, 7)).end;

  const [scope, txScope] = await Promise.all([
    accountScope(supabase, householdId, memberId, "categories"),
    accountScope(supabase, householdId, memberId, "transactions"),
  ]);

  const [rows, prevRows, { data: accountRows, error: accountsError }, cleared, goals, { data: pending }, cards, colors] =
    await Promise.all([
      fetchMonthTransactions(supabase, householdId, start, end, scope),
      fetchMonthTransactions(supabase, householdId, prevBounds.start, prevBounds.end, scope),
      scope.ids.length > 0
        ? supabase
            .from("accounts")
            .select("id, name, type, is_archived, opening_balance_cents")
            .eq("household_id", householdId)
            .in("id", scope.ids)
            .order("name")
        : Promise.resolve({ data: [], error: null }),
      scope.ids.length > 0
        ? fetchAll<{ account_id: string; date: string; amount_cents: number; direction: "in" | "out" }>((from, to) =>
            supabase
              .from("transactions")
              .select("account_id, date, amount_cents, direction")
              .eq("household_id", householdId)
              .eq("status", "cleared")
              .in("account_id", scope.ids)
              .lte("date", end)
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([]),
      // As metas como estavam no último dia do mês resumido.
      loadGoals({ supabase, householdId, memberId, today: end }),
      txScope.ids.length > 0
        ? supabase
            // limite: previstos de um mês, poucas dezenas
            .from("transactions")
            .select("amount_cents, direction, account_id, transfer_group_id")
            .eq("household_id", householdId)
            .eq("status", "pending")
            .in("account_id", txScope.ids)
            .gte("date", nextStart)
            .lte("date", nextEnd)
        : Promise.resolve({ data: [] }),
      loadCards(supabase, householdId, memberId, ctx.today),
      getCategoryColorMap(supabase, householdId),
    ]);
  if (accountsError) throw new Error(accountsError.message);

  const accountList = (accountRows ?? []) as {
    id: string;
    name: string;
    type: string;
    is_archived: boolean;
    opening_balance_cents: number;
  }[];
  const cardIds = new Set(accountList.filter((a) => a.type === "credit_card").map((a) => a.id));
  const moved = new Set(rows.map((r) => r.account_id));
  const balances = accountBalancesInMonth({
    month,
    accounts: accountList
      .filter((a) => !a.is_archived || moved.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, card: a.type === "credit_card", openingCents: a.opening_balance_cents })),
    cleared,
  });

  // Previsto pro mês novo: pendentes (fora cartão e transferência) e faturas.
  const allCardIds = new Set([...cardIds, ...cards.map((c) => c.id)]);
  const nextRows = (pending ?? []).filter(
    (r) => !allCardIds.has(r.account_id as string) && r.transfer_group_id === null,
  );
  const bills = cardBills(cards.filter((c) => c.canEdit || c.canSeeTransactions)).filter(
    (b) => b.date >= nextStart && b.date <= nextEnd,
  );
  const next = {
    outCents:
      nextRows.filter((r) => r.direction === "out").reduce((s, r) => s + (r.amount_cents as number), 0) +
      bills.reduce((s, b) => s + b.amountCents, 0),
    inCents: nextRows.filter((r) => r.direction === "in").reduce((s, r) => s + (r.amount_cents as number), 0),
    count: nextRows.length + bills.length,
  };

  const summary = buildMonth({
    month,
    rows,
    prevRows,
    accounts: balances,
    goals: goalLines(goals, memberId, month),
    next,
    excludedCount: scope.excludedCount,
  });
  for (const c of summary.categories) c.color = colors.get(c.name)?.fg;
  return summary;
}
