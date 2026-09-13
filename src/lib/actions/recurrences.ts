"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";
import type { RecurrenceFrequency } from "@/lib/recurrence";
import { materializeOccurrences } from "@/lib/materialize-occurrences";

export async function createRecurrence(formData: FormData) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  const direction = String(formData.get("direction") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const amountInput = String(formData.get("amount") ?? "");
  const frequency = String(formData.get("frequency") ?? "") as RecurrenceFrequency;
  const dayOfMonthInput = String(formData.get("day_of_month") ?? "");
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "") || null;

  if (!description) throw new Error("Descrição é obrigatória.");
  if (direction !== "in" && direction !== "out") throw new Error("Direção inválida.");
  if (!accountId) throw new Error("Conta é obrigatória.");
  if (!["monthly", "weekly", "yearly"].includes(frequency)) {
    throw new Error("Frequência inválida.");
  }
  if (!startsOn) throw new Error("Data de início é obrigatória.");

  const amountCents = parseToCents(amountInput);
  if (amountCents <= 0) throw new Error("Valor precisa ser maior que zero.");

  const dayOfMonth =
    frequency === "monthly" ? (dayOfMonthInput ? Number(dayOfMonthInput) : null) : null;
  if (frequency === "monthly" && (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new Error("Dia do mês inválido.");
  }

  const template = {
    account_id: accountId,
    category_id: categoryId,
    direction,
    amount_cents: amountCents,
    description,
    notes: null,
  } as const;

  const { data: recurrence, error } = await supabase
    .from("recurrences")
    .insert({
      household_id: householdId,
      template,
      frequency,
      day_of_month: dayOfMonth,
      starts_on: startsOn,
      ends_on: endsOn,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await materializeOccurrences({
    recurrenceId: recurrence.id,
    householdId,
    memberId,
    template,
    frequency,
    startsOn,
    dayOfMonth,
    endsOn,
  });

  revalidatePath("/a-pagar");
  revalidatePath("/transacoes");
}

export async function deactivateRecurrence(recurrenceId: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error: updateError } = await supabase
    .from("recurrences")
    .update({ is_active: false })
    .eq("id", recurrenceId);
  if (updateError) throw new Error(updateError.message);

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("recurrence_id", recurrenceId)
    .eq("status", "pending")
    .gte("date", today);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/a-pagar");
  revalidatePath("/transacoes");
}
