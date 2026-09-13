import { createClient } from "@/lib/supabase/server";
import { computeFingerprint } from "@/lib/fingerprint";
import { generateOccurrenceDates, type RecurrenceFrequency } from "@/lib/recurrence";

export const OCCURRENCES_TO_MATERIALIZE = 12;

export type RecurrenceTemplate = {
  account_id: string;
  category_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  description: string;
  notes: string | null;
};

// Gera e grava as próximas ocorrências `pending` de uma recorrência —
// usado tanto ao criar uma recorrência avulsa (tela A vencer) quanto
// ao marcar um lançamento manual como recorrente. `from` permite pular
// a data-âncora quando ela já foi gravada como a própria transação.
export async function materializeOccurrences(params: {
  recurrenceId: string;
  householdId: string;
  memberId: string;
  template: RecurrenceTemplate;
  frequency: RecurrenceFrequency;
  startsOn: string;
  dayOfMonth: number | null;
  endsOn: string | null;
  from?: string;
}) {
  const supabase = await createClient();

  const dates = generateOccurrenceDates({
    frequency: params.frequency,
    startsOn: params.startsOn,
    dayOfMonth: params.dayOfMonth,
    endsOn: params.endsOn,
    count: OCCURRENCES_TO_MATERIALIZE,
    from: params.from,
  });

  if (dates.length === 0) return;

  const rows = dates.map((date) => ({
    household_id: params.householdId,
    account_id: params.template.account_id,
    category_id: params.template.category_id,
    date,
    amount_cents: params.template.amount_cents,
    direction: params.template.direction,
    description: params.template.description,
    notes: params.template.notes,
    status: "pending" as const,
    recurrence_id: params.recurrenceId,
    fingerprint: computeFingerprint({
      accountId: params.template.account_id,
      date,
      amountCents: params.template.amount_cents,
      description: params.template.description,
    }),
    created_by: params.memberId,
  }));

  const { error } = await supabase.from("transactions").insert(rows);
  if (error) throw new Error(error.message);
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Cria a recorrência a partir de um lançamento que está sendo salvo
// agora (âncora) e materializa as ocorrências futuras — a âncora em si
// não é duplicada, ela já é a transação sendo criada/editada.
export async function createRecurrenceFromAnchor(params: {
  householdId: string;
  memberId: string;
  template: RecurrenceTemplate;
  frequency: RecurrenceFrequency;
  anchorDate: string;
  endsOn: string | null;
}): Promise<string> {
  const supabase = await createClient();

  const dayOfMonth =
    params.frequency === "monthly" ? Number(params.anchorDate.split("-")[2]) : null;

  const { data: recurrence, error } = await supabase
    .from("recurrences")
    .insert({
      household_id: params.householdId,
      template: params.template,
      frequency: params.frequency,
      day_of_month: dayOfMonth,
      starts_on: params.anchorDate,
      ends_on: params.endsOn,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await materializeOccurrences({
    recurrenceId: recurrence.id,
    householdId: params.householdId,
    memberId: params.memberId,
    template: params.template,
    frequency: params.frequency,
    startsOn: params.anchorDate,
    dayOfMonth,
    endsOn: params.endsOn,
    from: addDays(params.anchorDate, 1),
  });

  return recurrence.id;
}
