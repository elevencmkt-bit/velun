import type { SupabaseClient } from "@supabase/supabase-js";
import { accountScope } from "@/lib/visibility";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { buildReportInsight, categoryDeltas, type MonthTransaction, type ReportInsight } from "@/lib/reports";
import { addDays, type ReportPeriod } from "./period";

// Tudo que o relatório em PDF mostra, calculado no servidor a partir dos
// lançamentos — nada é guardado (princípio 5).
//
// Privacidade, igual ao resto do app:
// - totais por categoria: escopo `categories` (inclui conta pessoal que
//   mostra só a soma);
// - lançamento a lançamento (detalhamento, a vencer): escopo `transactions`;
// - saldo de conta: escopo `balance`.
// O que entra no total mas não pode ser listado aparece como total.

const UNCATEGORIZED = "Sem categoria";

type Tx = {
  id: string;
  account_id: string;
  date: string;
  amount_cents: number;
  direction: "in" | "out";
  description: string;
  status: string;
  transfer_group_id: string | null;
  category: { name: string } | { name: string }[] | null;
  account: { name: string } | { name: string }[] | null;
};

const single = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toMonthRows(rows: Tx[]): MonthTransaction[] {
  return rows.map((r) => ({
    id: r.id,
    account_id: r.account_id,
    date: r.date,
    amount_cents: r.amount_cents,
    direction: r.direction,
    description: r.description,
    transfer_group_id: r.transfer_group_id,
    category_name: single(r.category)?.name ?? null,
    account_name: single(r.account)?.name ?? "—",
  }));
}

export type ReportCategoryRow = {
  name: string;
  amount_cents: number;
  prev_cents: number | null;
  share: number;
  color: string;
};

export type ReportDetailGroup = {
  name: string;
  direction: "in" | "out";
  total_cents: number;
  color: string;
  rows: { date: string; description: string; account_name: string; amount_cents: number }[];
  /** Parte do total que vem de contas que mostram só a soma. */
  hidden_cents: number;
};

export type ReportData = {
  period: ReportPeriod;
  accountNames: string[];
  hiddenAccountsNote: boolean;
  totals: { income: number; expense: number; balance: number; incomePrev: number; expensePrev: number; balancePrev: number };
  insight: ReportInsight | null;
  expense: ReportCategoryRow[];
  income: ReportCategoryRow[];
  /** Por dia (um mês) ou por mês (mais de um). */
  evolution: { label: string; income: number; expense: number }[];
  accounts: { name: string; type: string; start: number; inflow: number; outflow: number; end: number }[];
  upcoming: { date: string; description: string; account_name: string; category_name: string; direction: "in" | "out"; amount_cents: number }[];
  /** Categoria × mês (só quando o período tem mais de um mês). */
  byMonth: {
    expense: { name: string; values: number[]; total: number }[];
    income: { name: string; values: number[]; total: number }[];
    expenseTotals: number[];
    incomeTotals: number[];
  } | null;
  detail: ReportDetailGroup[] | null;
};

export async function buildReportData(params: {
  supabase: SupabaseClient;
  householdId: string;
  memberId: string;
  period: ReportPeriod;
  /** Contas escolhidas no formulário; null = todas que dá pra ver. */
  accountIds: string[] | null;
  full: boolean;
}): Promise<ReportData> {
  const { supabase, householdId, memberId, period, full } = params;

  const [cat, list, bal, colorMap] = await Promise.all([
    accountScope(supabase, householdId, memberId, "categories"),
    accountScope(supabase, householdId, memberId, "transactions"),
    accountScope(supabase, householdId, memberId, "balance"),
    getCategoryColorMap(supabase, householdId),
  ]);

  const pick = (ids: string[]) => (params.accountIds ? ids.filter((id) => params.accountIds!.includes(id)) : ids);
  const catIds = pick(cat.ids);
  const listIds = new Set(pick(list.ids));
  const balIds = pick(bal.ids);

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type, opening_balance_cents, sort_order")
    .eq("household_id", householdId)
    .in("id", [...new Set([...catIds, ...balIds])].length > 0 ? [...new Set([...catIds, ...balIds])] : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order")
    .order("name");
  const accountsById = new Map((accountRows ?? []).map((a) => [a.id as string, a]));

  const fetchRange = (from: string, to: string, ids: string[], status: "cleared" | "pending") =>
    ids.length === 0
      ? Promise.resolve([] as Tx[])
      : fetchAll<Tx>((a, b) =>
          supabase
            .from("transactions")
            .select(
              "id, account_id, date, amount_cents, direction, description, status, transfer_group_id, category:categories(name), account:accounts(name)",
            )
            .eq("household_id", householdId)
            .eq("status", status)
            .in("account_id", ids)
            .gte("date", from)
            .lte("date", to)
            .order("date")
            .order("id")
            .range(a, b),
        );

  const [curRaw, prevRaw, upcomingRaw, balanceRaw] = await Promise.all([
    fetchRange(period.from, period.to, catIds, "cleared"),
    fetchRange(period.prev.from, period.prev.to, catIds, "cleared"),
    fetchRange(addDays(period.to, 1), addDays(period.to, 31), [...listIds], "pending"),
    balIds.length === 0
      ? Promise.resolve([] as { account_id: string; date: string; amount_cents: number; direction: "in" | "out" }[])
      : fetchAll<{ account_id: string; date: string; amount_cents: number; direction: "in" | "out" }>((a, b) =>
          supabase
            .from("transactions")
            .select("account_id, date, amount_cents, direction")
            .eq("household_id", householdId)
            .eq("status", "cleared")
            .in("account_id", balIds)
            .lte("date", period.to)
            .order("id")
            .range(a, b),
        ),
  ]);

  // Transferência entre contas não é receita nem despesa.
  const current = toMonthRows(curRaw).filter((r) => !r.transfer_group_id);
  const previous = toMonthRows(prevRaw).filter((r) => !r.transfer_group_id);

  const sum = (rows: MonthTransaction[], d: "in" | "out") =>
    rows.filter((r) => r.direction === d).reduce((n, r) => n + r.amount_cents, 0);
  const income = sum(current, "in");
  const expense = sum(current, "out");
  const incomePrev = sum(previous, "in");
  const expensePrev = sum(previous, "out");
  const totals = {
    income,
    expense,
    balance: income - expense,
    incomePrev,
    expensePrev,
    balancePrev: incomePrev - expensePrev,
  };

  const colorOf = (name: string, d: "in" | "out") =>
    (colorMap.get(name) ?? (d === "in" ? { fg: "#12B76A" } : MUTED_CATEGORY_COLOR)).fg;
  const expenseDeltas = categoryDeltas(current, previous, "out");
  const incomeDeltas = categoryDeltas(current, previous, "in");
  const withShare = (rows: typeof expenseDeltas, total: number, d: "in" | "out"): ReportCategoryRow[] =>
    rows.map((r) => ({ ...r, share: total > 0 ? r.amount_cents / total : 0, color: colorOf(r.name, d) }));

  // A frase do Insight foi escrita pra um mês: só entra quando é um mês.
  const insight =
    period.kind === "month"
      ? buildReportInsight({ ...totals, expenseDeltas, prevName: period.prev.label })
      : null;

  // Evolução: por dia num mês só, por mês quando passa de um.
  let evolution: ReportData["evolution"];
  if (period.multiMonth) {
    evolution = period.months.map((m) => {
      const inMonth = current.filter((r) => r.date.startsWith(m));
      return { label: m, income: sum(inMonth, "in"), expense: sum(inMonth, "out") };
    });
  } else {
    evolution = [];
    for (let d = period.from; d <= period.to; d = addDays(d, 1)) {
      const day = current.filter((r) => r.date === d);
      evolution.push({ label: d, income: sum(day, "in"), expense: sum(day, "out") });
    }
  }

  // Contas: saldo no começo, o que entrou e saiu no período, saldo no fim.
  // Aqui transferência conta: muda o saldo de verdade.
  const accounts = balIds
    .map((id) => {
      const a = accountsById.get(id);
      if (!a) return null;
      let start = (a.opening_balance_cents as number) ?? 0;
      let inflow = 0;
      let outflow = 0;
      for (const t of balanceRaw) {
        if (t.account_id !== id) continue;
        const signed = t.direction === "in" ? t.amount_cents : -t.amount_cents;
        if (t.date < period.from) start += signed;
        else if (t.direction === "in") inflow += t.amount_cents;
        else outflow += t.amount_cents;
      }
      return { name: a.name as string, type: a.type as string, start, inflow, outflow, end: start + inflow - outflow };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const upcoming = toMonthRows(upcomingRaw)
    .filter((r) => !r.transfer_group_id)
    .map((r) => ({
      date: r.date,
      description: r.description,
      account_name: r.account_name,
      category_name: r.category_name ?? UNCATEGORIZED,
      direction: r.direction,
      amount_cents: r.amount_cents,
    }));

  let byMonth: ReportData["byMonth"] = null;
  if (period.multiMonth) {
    const table = (d: "in" | "out", names: string[]) =>
      names.map((name) => {
        const values = period.months.map((m) =>
          current
            .filter((r) => r.direction === d && (r.category_name ?? UNCATEGORIZED) === name && r.date.startsWith(m))
            .reduce((n, r) => n + r.amount_cents, 0),
        );
        return { name, values, total: values.reduce((n, v) => n + v, 0) };
      });
    const monthTotals = (d: "in" | "out") =>
      period.months.map((m) => sum(current.filter((r) => r.date.startsWith(m)), d));
    byMonth = {
      expense: table("out", expenseDeltas.map((r) => r.name)),
      income: table("in", incomeDeltas.map((r) => r.name)),
      expenseTotals: monthTotals("out"),
      incomeTotals: monthTotals("in"),
    };
  }

  let detail: ReportData["detail"] = null;
  if (full) {
    const group = (d: "in" | "out", deltas: typeof expenseDeltas): ReportDetailGroup[] =>
      deltas.map((c) => {
        const inCat = current.filter((r) => r.direction === d && (r.category_name ?? UNCATEGORIZED) === c.name);
        const visible = inCat.filter((r) => listIds.has(r.account_id));
        const listed = visible.reduce((n, r) => n + r.amount_cents, 0);
        return {
          name: c.name,
          direction: d,
          total_cents: c.amount_cents,
          color: colorOf(c.name, d),
          rows: visible.map((r) => ({
            date: r.date,
            description: r.description,
            account_name: r.account_name,
            amount_cents: r.amount_cents,
          })),
          hidden_cents: c.amount_cents - listed,
        };
      });
    detail = [...group("out", expenseDeltas), ...group("in", incomeDeltas)];
  }

  return {
    period,
    accountNames: catIds.map((id) => accountsById.get(id)?.name as string).filter(Boolean),
    hiddenAccountsNote: catIds.some((id) => !listIds.has(id)),
    totals,
    insight,
    expense: withShare(expenseDeltas, expense, "out"),
    income: withShare(incomeDeltas, income, "in"),
    evolution,
    accounts,
    upcoming,
    byMonth,
    detail,
  };
}
