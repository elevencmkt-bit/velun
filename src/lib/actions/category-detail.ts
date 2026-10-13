"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { monthRange, shiftMonth } from "@/lib/month";

// O que o painel lateral de uma categoria mostra (Relatórios e Dashboard).
//
// Privacidade: o TOTAL vem do mesmo escopo do relatório (`categories`,
// que inclui contas pessoais liberadas só pra soma por categoria), mas a
// LISTA lançamento a lançamento só usa contas que quem vê pode ver
// lançamento a lançamento (`transactions`). A diferença aparece como um
// total, sem detalhe — igual ao relatório, que já mostrava essa soma.

export type CategoryDetailRow = {
  id: string;
  date: string;
  description: string;
  account_name: string;
  institution: string | null;
  account_type: string;
  amount_cents: number;
  category_id: string | null;
  can_edit: boolean;
};

export type CategoryDetail = {
  name: string;
  direction: "in" | "out";
  rows: CategoryDetailRow[];
  totalCents: number;
  /** null quando o período não tem com o que comparar (todo o período, de/até). */
  prevCents: number | null;
  /** Parte do total que vem de contas que só mostram a soma. */
  hiddenCents: number;
  categories: { id: string; name: string; kind: "income" | "expense"; icon: string | null; is_transfer?: boolean }[];
};

type Raw = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  account_id: string;
  category_id: string | null;
  account: AccountJoin | AccountJoin[] | null;
};
type AccountJoin = { name: string; institution: string | null; type: string; owner_id: string | null };

export async function getCategoryDetail(params: {
  /** "2026-09" */
  month: string;
  /**
   * Período longo dos Relatórios (ano, todo o período, de/até): troca o
   * mês por estas datas. `prev` só no ano; sem ele, nada de comparação.
   */
  period?: { from: string; to: string; prev?: { from: string; to: string } | null } | null;
  name: string;
  direction: "in" | "out";
  status: "cleared" | "pending";
  /** Só uma conta (filtro de conta do Dashboard); sem ele, todas. */
  accountId?: string | null;
}): Promise<CategoryDetail> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  let start: string;
  let end: string;
  let prevRange: { start: string; end: string } | null;
  if (params.period) {
    const { from, to, prev } = params.period;
    if (!isoDate.test(from) || !isoDate.test(to)) throw new Error("Período inválido.");
    start = from;
    end = to;
    prevRange = prev && isoDate.test(prev.from) && isoDate.test(prev.to) ? { start: prev.from, end: prev.to } : null;
  } else {
    const m = params.month.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error("Mês inválido.");
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    ({ start, end } = monthRange(year, monthIndex));
    const prev = shiftMonth(year, monthIndex, -1);
    prevRange = monthRange(prev.year, prev.monthIndex);
  }

  const [totalsScopeAll, listScopeAll, { data: categories }] = await Promise.all([
    accountScope(supabase, householdId, memberId, "categories"),
    accountScope(supabase, householdId, memberId, "transactions"),
    supabase
      .from("categories")
      .select("id, name, kind, icon, is_transfer")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
  ]);

  // Filtro de conta: só estreita o que a pessoa já pode ver.
  const only = (ids: string[]) => (params.accountId ? ids.filter((id) => id === params.accountId) : ids);
  const totalsScope = { ids: only(totalsScopeAll.ids) };
  const listScope = { ids: only(listScopeAll.ids) };

  // "Sem categoria" é a ausência de categoria; as outras, pelo nome (é
  // como o relatório agrupa).
  const uncategorized = params.name === "Sem categoria";
  const { data: matching } = uncategorized
    ? { data: [] as { id: string }[] }
    : await supabase
        .from("categories")
        .select("id")
        .eq("household_id", householdId)
        .eq("name", params.name);
  const categoryIds = (matching ?? []).map((c) => c.id as string);
  if (!uncategorized && categoryIds.length === 0) {
    return {
      name: params.name,
      direction: params.direction,
      rows: [],
      totalCents: 0,
      prevCents: prevRange ? 0 : null,
      hiddenCents: 0,
      categories: (categories ?? []) as CategoryDetail["categories"],
    };
  }

  const fetchRange = (from: string, to: string, ids: string[]) =>
    ids.length === 0
      ? Promise.resolve([] as Raw[])
      : fetchAll<Raw>((a, b) => {
          let q = supabase
            .from("transactions")
            .select(
              "id, date, description, amount_cents, account_id, category_id, account:accounts(name, institution, type, owner_id)",
            )
            .eq("household_id", householdId)
            .eq("status", params.status)
            .eq("direction", params.direction)
            .is("transfer_group_id", null)
            .in("account_id", ids)
            .gte("date", from)
            .lte("date", to);
          q = uncategorized ? q.is("category_id", null) : q.in("category_id", categoryIds);
          return q.order("date", { ascending: false }).order("id").range(a, b);
        });

  const [current, previous] = await Promise.all([
    fetchRange(start, end, totalsScope.ids),
    prevRange ? fetchRange(prevRange.start, prevRange.end, totalsScope.ids) : Promise.resolve(null),
  ]);

  const listable = new Set(listScope.ids);
  const sum = (rows: Raw[]) => rows.reduce((n, r) => n + r.amount_cents, 0);
  const single = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const visible = current.filter((r) => listable.has(r.account_id));
  const rows: CategoryDetailRow[] = visible.map((r) => {
    const account = single(r.account);
    return {
      id: r.id,
      date: r.date,
      description: r.description,
      account_name: account?.name ?? "—",
      institution: account?.institution ?? null,
      account_type: account?.type ?? "checking",
      amount_cents: r.amount_cents,
      category_id: r.category_id,
      // Mexe na conta do casal e nas próprias; as do outro, só olha.
      can_edit: account?.owner_id == null || account.owner_id === memberId,
    };
  });

  const totalCents = sum(current);
  return {
    name: params.name,
    direction: params.direction,
    rows,
    totalCents,
    prevCents: previous ? sum(previous) : null,
    hiddenCents: totalCents - sum(visible),
    categories: (categories ?? []) as CategoryDetail["categories"],
  };
}
