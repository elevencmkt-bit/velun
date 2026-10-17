import { createClient } from "@/lib/supabase/server";
import { computeFingerprint } from "@/lib/fingerprint";
import { generateOccurrenceDates, usesDayOfMonth, type RecurrenceFrequency } from "@/lib/recurrence";

// As primeiras 12 nascem aqui; daí pra frente a rotina diária do banco
// (top_up_recurrences, migração 0031) mantém cada recorrência ativa
// preenchida até 12 meses à frente.
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
  /** Datas que já têm lançamento (o que está sendo editado agora). */
  skipDates?: string[];
}) {
  const supabase = await createClient();

  const skip = new Set(params.skipDates ?? []);
  const dates = generateOccurrenceDates({
    frequency: params.frequency,
    startsOn: params.startsOn,
    dayOfMonth: params.dayOfMonth,
    endsOn: params.endsOn,
    count: OCCURRENCES_TO_MATERIALIZE,
    from: params.from,
  }).filter((d) => !skip.has(d));

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
    usesDayOfMonth(params.frequency) ? Number(params.anchorDate.split("-")[2]) : null;

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

/**
 * Troca as previsões de uma recorrência a partir de `from` (inclusive)
 * pelas geradas com o modelo e o calendário ATUAIS. Só mexe no que é
 * previsão (`pending`): o que já caiu fica como aconteceu.
 */
export async function replaceFutureOccurrences(params: {
  recurrenceId: string;
  householdId: string;
  memberId: string;
  from: string;
  /** Lançamento que fica (o que está sendo editado), e a data dele. */
  keep?: { id: string; date: string };
}): Promise<number> {
  const supabase = await createClient();
  const { data: rec, error } = await supabase
    .from("recurrences")
    .select("template, frequency, starts_on, day_of_month, ends_on, is_active")
    .eq("id", params.recurrenceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) throw new Error("Recorrência não encontrada.");

  let del = supabase
    .from("transactions")
    .delete()
    .eq("recurrence_id", params.recurrenceId)
    .eq("status", "pending")
    .gte("date", params.from);
  if (params.keep) del = del.neq("id", params.keep.id);
  const { error: delError } = await del;
  if (delError) throw new Error(delError.message);

  if (!rec.is_active) return 0;
  await materializeOccurrences({
    recurrenceId: params.recurrenceId,
    householdId: params.householdId,
    memberId: params.memberId,
    template: rec.template as RecurrenceTemplate,
    frequency: rec.frequency as RecurrenceFrequency,
    startsOn: rec.starts_on as string,
    dayOfMonth: (rec.day_of_month as number | null) ?? null,
    endsOn: (rec.ends_on as string | null) ?? null,
    from: params.from,
    skipDates: params.keep ? [params.keep.date] : [],
  });
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("recurrence_id", params.recurrenceId)
    .eq("status", "pending")
    .gte("date", params.from);
  return count ?? 0;
}
