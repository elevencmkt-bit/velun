import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents } from "@/lib/money";
import { buildCategoryColorMap, MUTED_SLICE_COLOR } from "@/lib/category-colors";
import {
  excludeTransfers,
  groupExpensesByCategory,
  percentChange,
  sumByDirection,
  topExpenses,
  type MonthTransaction,
} from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthDonut } from "./month-donut";

function monthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
}

function shiftMonth(year: number, monthIndex: number, delta: number) {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

function monthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());
}

async function fetchMonthTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  start: string,
  end: string,
): Promise<MonthTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `id, date, amount_cents, direction, description, transfer_group_id,
       account:accounts(name),
       category:categories(name)`,
    )
    .eq("household_id", householdId)
    .eq("status", "cleared")
    .gte("date", start)
    .lte("date", end);

  if (error) throw new Error(error.message);

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    amount_cents: row.amount_cents,
    direction: row.direction,
    description: row.description,
    transfer_group_id: row.transfer_group_id,
    account_name: single<{ name: string }>(row.account)?.name ?? "—",
    category_name: single<{ name: string }>(row.category)?.name ?? null,
  }));
}

function DeltaLabel({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="text-xs text-[--ink]/50">sem dado anterior</span>;
  const sign = change > 0 ? "+" : "";
  return (
    <span className="text-xs text-[--ink]/50">
      {sign}
      {change.toFixed(0)}% vs mês passado
    </span>
  );
}

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();
  const { month } = await searchParams;

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    year = y;
    monthIndex = m - 1;
  }

  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const prevRange = monthRange(prev.year, prev.monthIndex);
  const next = shiftMonth(year, monthIndex, 1);

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", householdId)
    .limit(1);
  const householdIsEmpty = !accounts || accounts.length === 0;

  const [currentRows, prevRows, { data: expenseCategories }] = await Promise.all([
    fetchMonthTransactions(supabase, householdId, start, end),
    fetchMonthTransactions(supabase, householdId, prevRange.start, prevRange.end),
    supabase
      .from("categories")
      .select("name")
      .eq("household_id", householdId)
      .eq("kind", "expense"),
  ]);

  const current = excludeTransfers(currentRows);
  const previous = excludeTransfers(prevRows);

  const entrou = sumByDirection(current, "in");
  const saiu = sumByDirection(current, "out");
  const sobrou = entrou - saiu;

  const entrouPrev = sumByDirection(previous, "in");
  const saiuPrev = sumByDirection(previous, "out");
  const sobrouPrev = entrouPrev - saiuPrev;

  const colorMap = buildCategoryColorMap((expenseCategories ?? []).map((c) => c.name));
  const slices = groupExpensesByCategory(current).map((slice) => ({
    ...slice,
    color: colorMap.get(slice.name) ?? MUTED_SLICE_COLOR,
  }));

  const top5 = topExpenses(current, 5);

  if (householdIsEmpty) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-lg font-medium">Mês</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal text-[--ink]/70">
              Household vazio
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[--ink]/70">
            Nenhuma conta ainda. Cadastre uma conta em{" "}
            <span className="font-medium">Contas</span> ou lance algo em{" "}
            <span className="font-medium">Transações</span> para começar.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Mês</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/mes?month=${monthParam(prev.year, prev.monthIndex)}`}
            className="text-[--ink]/60 hover:text-[--ink]"
          >
            ← anterior
          </Link>
          <span className="font-medium capitalize">{monthLabel(year, monthIndex)}</span>
          <Link
            href={`/mes?month=${monthParam(next.year, next.monthIndex)}`}
            className="text-[--ink]/60 hover:text-[--ink]"
          >
            próximo →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[--ink]/60">Entrou</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--in)" }}>
              {formatCents(entrou)}
            </span>
            <DeltaLabel current={entrou} previous={entrouPrev} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[--ink]/60">Saiu</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--out)" }}>
              {formatCents(saiu)}
            </span>
            <DeltaLabel current={saiu} previous={saiuPrev} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[--ink]/60">Sobrou</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span
              className="text-2xl font-semibold tabular-nums"
              style={{ color: sobrou < 0 ? "var(--out)" : "var(--in)" }}
            >
              {formatCents(sobrou)}
            </span>
            <DeltaLabel current={sobrou} previous={sobrouPrev} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Despesas por categoria</h2>
        <MonthDonut slices={slices} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Maiores despesas</h2>
        {top5.length === 0 ? (
          <p className="text-sm text-[--ink]/70">Nenhuma despesa neste mês.</p>
        ) : (
          <div className="flex flex-col">
            {top5.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 border-b border-[--rule]/60 py-2 text-sm"
              >
                <span className="w-40 truncate">{row.description}</span>
                <span className="w-32 text-[--ink]/60">{row.category_name ?? "—"}</span>
                <span className="w-28 text-[--ink]/60">{row.account_name}</span>
                <span
                  className="ml-auto font-medium tabular-nums"
                  style={{ color: "var(--out)" }}
                >
                  -{formatCents(row.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
