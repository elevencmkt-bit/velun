import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { getCategoryColorMap } from "@/lib/category-colors";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurrenceForm } from "./recurrence-form";
import { PendingList, type PendingRow } from "./pending-list";
import { RecurrencesList, type RecurrenceRow } from "./recurrences-list";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function AVencerPage() {
  const { householdId, memberId, currency } = await getCurrentMember();
  const supabase = await createClient();

  // A vencer é extrato futuro: mesmo nível do extrato. De conta pessoal
  // do outro, só entra a marcada como "aberta".
  const scope = await accountScope(
    supabase,
    householdId,
    memberId,
    "transactions",
  );
  const visibleIds =
    scope.ids.length > 0 ? scope.ids : ["00000000-0000-0000-0000-000000000000"];
  const visibleSet = new Set(scope.ids);
  const today = todayISO();
  const horizon = addDaysISO(30);

  const [
    { data: accounts },
    { data: categories },
    { data: pendingRaw },
    { data: recurrencesRaw },
    colorMap,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, owner_id, is_archived")
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
      .from("transactions")
      .select(
        `id, date, description, amount_cents, direction, account_id,
         account:accounts(name),
         category:categories(name)`,
      )
      .eq("household_id", householdId)
      .eq("status", "pending")
      .in("account_id", visibleIds)
      .lte("date", horizon)
      .order("date", { ascending: true }),
    supabase
      .from("recurrences")
      .select("id, template, frequency, day_of_month")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    getCategoryColorMap(supabase, householdId),
  ]);

  // Onde quem está vendo pode mexer: conta do casal e as próprias. É
  // também a lista de contas do formulário de recorrência — o banco
  // recusaria criar recorrência na conta pessoal do outro.
  const mine = (accounts ?? []).filter((a) => a.owner_id === null || a.owner_id === memberId);
  const writableIds = new Set(mine.map((a) => a.id as string));
  // Destino de recorrência nova ou movida: só conta ativa.
  const writable = mine.filter((a) => !a.is_archived);
  const accountNames = new Map(
    (accounts ?? []).map((a) => [a.id as string, a.name as string]),
  );
  const moveTargets = writable.map((a) => ({
    id: a.id as string,
    name: a.name as string,
  }));

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const pendingRows: PendingRow[] = (pendingRaw ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    amount_cents: row.amount_cents,
    direction: row.direction,
    account_name: single<{ name: string }>(row.account)?.name ?? "—",
    category_name: single<{ name: string }>(row.category)?.name ?? null,
    is_overdue: row.date < today,
    can_edit: writableIds.has(row.account_id as string),
  }));

  const toPay = pendingRows.filter((r) => r.direction === "out");
  const toReceive = pendingRows.filter((r) => r.direction === "in");
  const totalToPay = toPay.reduce((sum, r) => sum + r.amount_cents, 0);
  const totalToReceive = toReceive.reduce((sum, r) => sum + r.amount_cents, 0);

  // A conta da recorrência mora no `template` (jsonb), então o filtro de
  // visibilidade é feito aqui e não na consulta.
  const recurrenceRows: RecurrenceRow[] = (recurrencesRaw ?? [])
    .filter((row) =>
      visibleSet.has((row.template as { account_id: string }).account_id),
    )
    .map((row) => {
      const template = row.template as {
        account_id: string;
        direction: "in" | "out";
        amount_cents: number;
        description: string;
      };
      return {
        id: row.id,
        description: template.description,
        amount_cents: template.amount_cents,
        direction: template.direction,
        frequency: row.frequency,
        day_of_month: row.day_of_month,
        account_id: template.account_id,
        account_name: accountNames.get(template.account_id) ?? "—",
        can_edit: writableIds.has(template.account_id),
      };
    });

  const recurrencesIn = recurrenceRows.filter((r) => r.direction === "in");
  const recurrencesOut = recurrenceRows.filter((r) => r.direction === "out");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">A vencer</h1>
          <p className="text-page-subtitle">
            Próximos 30 dias, atrasadas em destaque.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-card-title">A pagar</CardTitle>
              <span
                className="font-semibold tabular-nums"
                style={{ color: "var(--expense)" }}
              >
                {formatCents(totalToPay, currency)}
              </span>
            </CardHeader>
            <CardContent>
              <PendingList
                rows={toPay}
                categoryColors={Object.fromEntries(colorMap)}
                kind="pay"
                currency={currency}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-card-title">A receber</CardTitle>
              <span
                className="font-semibold tabular-nums"
                style={{ color: "var(--income)" }}
              >
                {formatCents(totalToReceive, currency)}
              </span>
            </CardHeader>
            <CardContent>
              <PendingList
                rows={toReceive}
                categoryColors={Object.fromEntries(colorMap)}
                kind="receive"
                currency={currency}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-card-title">Recorrências</h2>
          <RecurrenceForm
            accounts={writable.map((a) => ({
              id: a.id as string,
              name: a.name as string,
            }))}
            categories={categories ?? []}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-card-title">
                Entradas recorrentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RecurrencesList
                accounts={moveTargets}
                rows={recurrencesIn}
                currency={currency}
                emptyMessage="Nenhuma entrada recorrente cadastrada."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-card-title">
                Saídas recorrentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RecurrencesList
                accounts={moveTargets}
                rows={recurrencesOut}
                currency={currency}
                emptyMessage="Nenhuma saída recorrente cadastrada."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
