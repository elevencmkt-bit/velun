import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope, scopeLabel } from "@/lib/visibility";
import { getCategoryColorMap } from "@/lib/category-colors";
import { getCategoryIconMap } from "@/lib/category-icons";
import {
  monthRange,
  shiftMonth,
  monthParam,
  monthLabel,
  parseMonthParam,
} from "@/lib/month";
import { formatCents } from "@/lib/money";
import { TransactionsWorkspace } from "./workspace";
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
  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();

  // Extrato é o nível máximo de exposição: de conta pessoal do outro, só
  // entra o que ele marcou como "aberta". "Só o saldo" e "sem
  // lançamentos" ficam de fora — o banco deixa essas linhas passarem
  // (o saldo e os totais precisam delas), e quem filtra é esta camada.
  const scope = await accountScope(
    supabase,
    householdId,
    memberId,
    "transactions",
  );
  const visibleIds =
    scope.ids.length > 0 ? scope.ids : ["00000000-0000-0000-0000-000000000000"];
  const params = await searchParams;
  const hasCustomRange = Boolean(params.from || params.to);
  const { year, monthIndex } = parseMonthParam(params.month, today);
  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const next = shiftMonth(year, monthIndex, 1);

  const [
    { data: accounts },
    { data: categories },
    { data: members },
    colorMap,
    iconMap,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, owner_id")
      .eq("household_id", householdId)
      .in("id", visibleIds)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("members")
      .select("id, display_name")
      .eq("household_id", householdId),
    getCategoryColorMap(supabase, householdId),
    getCategoryIconMap(supabase, householdId),
  ]);

  let query = supabase
    .from("transactions")
    .select(
      `id, date, description, notes, bank_description, amount_cents, direction, status, import_id,
       transfer_group_id, recurrence_id, account_id, category_id, installment_number, installment_total,
       account:accounts(name),
       category:categories(name),
       creator:members!created_by(display_name)`,
    )
    .eq("household_id", householdId)
    .in("account_id", visibleIds)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.account) query = query.eq("account_id", params.account);
  if (params.category === "none") query = query.is("category_id", null);
  else if (params.category) query = query.eq("category_id", params.category);
  if (params.member) query = query.eq("created_by", params.member);
  if (params.origin === "manual") query = query.is("import_id", null);
  if (params.origin === "imported") query = query.not("import_id", "is", null);
  if (params.direction === "in" || params.direction === "out") {
    query = query.eq("direction", params.direction);
  }
  if (params.q) {
    // Procura no nome e no texto do banco: quem lembra de "Card Purchase
    // Fxreplay" também acha. Aspas protegem vírgula e parênteses, que a
    // sintaxe do filtro usaria como separador.
    const term = `"%${params.q.replace(/["\\]/g, "")}%"`;
    query = query.or(
      `description.ilike.${term},bank_description.ilike.${term}`,
    );
  }

  if (hasCustomRange) {
    if (params.from) query = query.gte("date", params.from);
    if (params.to) query = query.lte("date", params.to);
  } else {
    query = query.gte("date", start).lte("date", end);
  }

  const { data: rawRows, error } = await query;
  if (error) throw new Error(error.message);

  // Em que contas quem está vendo pode mexer: a do casal e as próprias.
  const writableIds = new Set(
    (accounts ?? [])
      .filter((a) => a.owner_id === null || a.owner_id === memberId)
      .map((a) => a.id as string),
  );

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const rows: TransactionRow[] = (rawRows ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    notes: row.notes,
    bank_description: row.bank_description,
    amount_cents: row.amount_cents,
    direction: row.direction,
    status: row.status,
    is_overdue: row.status === "pending" && row.date < today,
    import_id: row.import_id,
    transfer_group_id: row.transfer_group_id,
    recurrence_id: row.recurrence_id,
    installment: row.installment_total
      ? `${row.installment_number} de ${row.installment_total}`
      : null,
    account_id: row.account_id,
    category_id: row.category_id,
    account_name: single<{ name: string }>(row.account)?.name ?? "—",
    category_name: single<{ name: string }>(row.category)?.name ?? null,
    creator_name:
      single<{ display_name: string }>(row.creator)?.display_name ?? null,
    can_edit: writableIds.has(row.account_id),
  }));

  const totalIn = rows
    .filter((r) => r.direction === "in")
    .reduce((sum, r) => sum + r.amount_cents, 0);
  const totalOut = rows
    .filter((r) => r.direction === "out")
    .reduce((sum, r) => sum + r.amount_cents, 0);

  let totalLabel: string;
  let totalDisplay: string;
  let totalColor: string;
  if (params.direction === "in") {
    totalLabel = "Total de entradas";
    totalDisplay = `+${formatCents(totalIn, currency)}`;
    totalColor = "var(--income)";
  } else if (params.direction === "out") {
    totalLabel = "Total de saídas";
    totalDisplay = `-${formatCents(totalOut, currency)}`;
    totalColor = "var(--expense)";
  } else {
    const net = totalIn - totalOut;
    totalLabel = "Saldo do período";
    totalDisplay = `${net >= 0 ? "+" : "-"}${formatCents(Math.abs(net), currency)}`;
    totalColor = net >= 0 ? "var(--income)" : "var(--expense)";
  }

  return (
    <TransactionsWorkspace
      rows={rows}
      accounts={(accounts ?? []).map((a) => ({
        id: a.id as string,
        name: a.name as string,
      }))}
      editableAccounts={(accounts ?? [])
        .filter((a) => writableIds.has(a.id as string))
        .map((a) => ({ id: a.id as string, name: a.name as string }))}
      scopeNote={scopeLabel(scope)}
      categories={categories ?? []}
      members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
      categoryColors={Object.fromEntries(colorMap)}
      categoryIcons={Object.fromEntries(iconMap)}
      currency={currency}
      monthLabel={monthLabel(year, monthIndex)}
      prevHref={monthHref(params, monthParam(prev.year, prev.monthIndex))}
      nextHref={monthHref(params, monthParam(next.year, next.monthIndex))}
      totalLabel={totalLabel}
      totalDisplay={totalDisplay}
      totalColor={totalColor}
    />
  );
}
