import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
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

export default async function APagarPage() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();
  const today = todayISO();
  const horizon = addDaysISO(30);

  const [{ data: accounts }, { data: categories }, { data: pendingRaw }, { data: recurrencesRaw }] =
    await Promise.all([
      supabase.from("accounts").select("id, name").eq("household_id", householdId).order("name"),
      supabase
        .from("categories")
        .select("id, name, kind")
        .eq("household_id", householdId)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("transactions")
        .select(
          `id, date, description, amount_cents, direction,
           account:accounts(name),
           category:categories(name)`,
        )
        .eq("household_id", householdId)
        .eq("status", "pending")
        .lte("date", horizon)
        .order("date", { ascending: true }),
      supabase
        .from("recurrences")
        .select("id, template, frequency, day_of_month")
        .eq("household_id", householdId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

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
  }));

  const recurrenceRows: RecurrenceRow[] = (recurrencesRaw ?? []).map((row) => {
    const template = row.template as {
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
    };
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-medium">A pagar</h1>
        <p className="text-sm text-[--ink]/70">Próximos 30 dias, atrasadas em destaque.</p>
        <PendingList rows={pendingRows} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Recorrências</h2>
          <RecurrenceForm accounts={accounts ?? []} categories={categories ?? []} />
        </div>
        <RecurrencesList rows={recurrenceRows} />
      </div>
    </div>
  );
}
