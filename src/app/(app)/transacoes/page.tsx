import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getExpenseCategoryColorMap } from "@/lib/category-colors";
import { monthRange, shiftMonth, monthParam, monthLabel, parseMonthParam } from "@/lib/month";
import { formatCents } from "@/lib/money";
import { MonthSelector } from "@/components/month-selector";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionFilters } from "./filters";
import { TransactionsTable } from "./transactions-table";
import type { TransactionRow } from "./types";

// Constrói a URL de navegação de mês preservando os outros filtros ativos
// (conta, categoria, quem lançou, origem, busca) e removendo o intervalo
// manual de datas, já que trocar de mês deve substituir esse filtro.
function monthHref(params: Record<string, string | undefined>, month: string) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "from" || key === "to" || key === "month") continue;
    if (value) search.set(key, value);
  }
  search.set("month", month);
  return `/transacoes?${search.toString()}`;
}

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();
  const params = await searchParams;
  const hasCustomRange = Boolean(params.from || params.to);
  const { year, monthIndex } = parseMonthParam(params.month);
  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const next = shiftMonth(year, monthIndex, 1);

  const [{ data: accounts }, { data: categories }, { data: members }, colorMap] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name")
        .eq("household_id", householdId)
        .order("name"),
      supabase
        .from("categories")
        .select("id, name, kind")
        .eq("household_id", householdId)
        .eq("is_archived", false)
        .order("name"),
      supabase.from("members").select("id, display_name").eq("household_id", householdId),
      getExpenseCategoryColorMap(supabase, householdId),
    ]);

  let query = supabase
    .from("transactions")
    .select(
      `id, date, description, notes, amount_cents, direction, status, import_id,
       transfer_group_id, recurrence_id, account_id, category_id,
       account:accounts(name),
       category:categories(name),
       creator:members!created_by(display_name)`,
    )
    .eq("household_id", householdId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.account) query = query.eq("account_id", params.account);
  if (params.category) query = query.eq("category_id", params.category);
  if (params.member) query = query.eq("created_by", params.member);
  if (params.origin === "manual") query = query.is("import_id", null);
  if (params.origin === "imported") query = query.not("import_id", "is", null);
  if (params.direction === "in" || params.direction === "out") {
    query = query.eq("direction", params.direction);
  }
  if (params.q) query = query.ilike("description", `%${params.q}%`);

  if (hasCustomRange) {
    if (params.from) query = query.gte("date", params.from);
    if (params.to) query = query.lte("date", params.to);
  } else {
    query = query.gte("date", start).lte("date", end);
  }

  const { data: rawRows, error } = await query;
  if (error) throw new Error(error.message);

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const rows: TransactionRow[] = (rawRows ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    notes: row.notes,
    amount_cents: row.amount_cents,
    direction: row.direction,
    status: row.status,
    import_id: row.import_id,
    transfer_group_id: row.transfer_group_id,
    recurrence_id: row.recurrence_id,
    account_id: row.account_id,
    category_id: row.category_id,
    account_name: single<{ name: string }>(row.account)?.name ?? "—",
    category_name: single<{ name: string }>(row.category)?.name ?? null,
    creator_name: single<{ display_name: string }>(row.creator)?.display_name ?? null,
  }));

  const totalIn = rows.filter((r) => r.direction === "in").reduce((sum, r) => sum + r.amount_cents, 0);
  const totalOut = rows.filter((r) => r.direction === "out").reduce((sum, r) => sum + r.amount_cents, 0);

  let totalLabel: string;
  let totalDisplay: string;
  let totalColor: string;
  if (params.direction === "in") {
    totalLabel = "Total de entradas";
    totalDisplay = `+${formatCents(totalIn)}`;
    totalColor = "var(--income)";
  } else if (params.direction === "out") {
    totalLabel = "Total de saídas";
    totalDisplay = `-${formatCents(totalOut)}`;
    totalColor = "var(--expense)";
  } else {
    const net = totalIn - totalOut;
    totalLabel = "Saldo do período";
    totalDisplay = `${net >= 0 ? "+" : "-"}${formatCents(Math.abs(net))}`;
    totalColor = net >= 0 ? "var(--income)" : "var(--expense)";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title">Transações</h1>
        <MonthSelector
          label={monthLabel(year, monthIndex)}
          prevHref={monthHref(params, monthParam(prev.year, prev.monthIndex))}
          nextHref={monthHref(params, monthParam(next.year, next.monthIndex))}
        />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <Suspense>
            <TransactionFilters
              accounts={accounts ?? []}
              categories={categories ?? []}
              members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
            />
          </Suspense>
          <div className="flex items-center justify-between border-b border-(--border-soft) pb-3">
            <span className="text-metadata">
              {rows.length} {rows.length === 1 ? "transação" : "transações"}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-metadata">{totalLabel}</span>
              <span className="font-semibold tabular-nums" style={{ color: totalColor }}>
                {totalDisplay}
              </span>
            </span>
          </div>
          <TransactionsTable
            rows={rows}
            accounts={accounts ?? []}
            categories={categories ?? []}
            categoryColors={Object.fromEntries(colorMap)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
