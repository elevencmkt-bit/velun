"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";
import type { RecurrenceFrequency } from "@/lib/recurrence";
import {
  materializeOccurrences,
  replaceFutureOccurrences,
  type RecurrenceTemplate,
} from "@/lib/materialize-occurrences";

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
  const { today } = await getCurrentMember();
  const supabase = await createClient();

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

export type MoveRecurrenceResult = { ok: true; moved: number } | { ok: false; error: string };

/**
 * Move a recorrência e as ocorrências PREVISTAS pra outra conta. O que
 * já foi confirmado fica onde aconteceu. Tudo numa transação no banco
 * (migração 0017), que também decide quem pode: só quem mexe nas duas
 * contas — ninguém empurra despesa pra conta pessoal do outro.
 *
 * Devolve o erro em vez de lançar: o Next esconde a mensagem de exceção
 * em produção, e "você não pode mover pra essa conta" precisa chegar à
 * tela como está.
 */
export async function moveRecurrence(
  recurrenceId: string,
  accountId: string,
): Promise<MoveRecurrenceResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("move_recurrence", {
      p_recurrence_id: recurrenceId,
      p_account_id: accountId,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/a-pagar");
    revalidatePath("/transacoes");
    revalidatePath("/mes");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/contas");

    return { ok: true, moved: (data as { moved: number }).moved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}

export type RecurrenceForEdit = {
  id: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  category_id: string | null;
  account_id: string;
  frequency: RecurrenceFrequency;
  starts_on: string;
  day_of_month: number | null;
  ends_on: string | null;
  /** Próxima previsão a partir de hoje (ou null se não houver). */
  next_date: string | null;
  today: string;
};

/** Dados pra editar uma recorrência (e pro aviso no "Editar lançamento"). */
export async function getRecurrenceForEdit(recurrenceId: string): Promise<RecurrenceForEdit | null> {
  const { today } = await getCurrentMember();
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recurrences")
    .select("id, template, frequency, starts_on, day_of_month, ends_on, is_active")
    .eq("id", recurrenceId)
    .maybeSingle();
  if (!rec || !rec.is_active) return null;
  const { data: next } = await supabase
    .from("transactions")
    .select("date")
    .eq("recurrence_id", recurrenceId)
    .eq("status", "pending")
    .gte("date", today)
    .order("date")
    .limit(1)
    .maybeSingle();
  const t = rec.template as RecurrenceTemplate;
  return {
    id: rec.id as string,
    description: t.description,
    amount_cents: t.amount_cents,
    direction: t.direction,
    category_id: t.category_id ?? null,
    account_id: t.account_id,
    frequency: rec.frequency as RecurrenceFrequency,
    starts_on: rec.starts_on as string,
    day_of_month: (rec.day_of_month as number | null) ?? null,
    ends_on: (rec.ends_on as string | null) ?? null,
    next_date: (next?.date as string | undefined) ?? null,
    today,
  };
}

export type UpdateRecurrenceResult = { ok: true; changed: number } | { ok: false; error: string };

/**
 * Edita a recorrência: nome, valor, categoria, conta, de quanto em quanto
 * tempo, a próxima data e quando termina. As previsões daqui pra frente
 * são refeitas com o modelo novo; o que já caiu fica como aconteceu.
 * Devolve o erro (o Next esconde a mensagem de exceção em produção).
 */
export async function updateRecurrence(recurrenceId: string, formData: FormData): Promise<UpdateRecurrenceResult> {
  try {
    const { memberId, householdId, today } = await getCurrentMember();
    const supabase = await createClient();

    const description = String(formData.get("description") ?? "").trim();
    const categoryId = String(formData.get("category_id") ?? "") || null;
    const accountId = String(formData.get("account_id") ?? "");
    const frequency = String(formData.get("frequency") ?? "") as RecurrenceFrequency;
    const nextDate = String(formData.get("next_date") ?? "");
    const endsOn = String(formData.get("ends_on") ?? "") || null;
    const amountCents = parseToCents(String(formData.get("amount") ?? ""));

    if (!description) return { ok: false, error: "Coloque o nome." };
    if (amountCents <= 0) return { ok: false, error: "Valor precisa ser maior que zero." };
    if (!["monthly", "weekly", "yearly"].includes(frequency)) return { ok: false, error: "Escolha de quanto em quanto tempo repete." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return { ok: false, error: "Coloque a data da próxima vez." };
    if (nextDate < today) return { ok: false, error: "A próxima vez tem que ser hoje ou depois." };
    if (endsOn && endsOn < nextDate) return { ok: false, error: "O fim tem que ser depois da próxima vez." };

    const { data: rec } = await supabase
      .from("recurrences")
      .select("template")
      .eq("id", recurrenceId)
      .maybeSingle();
    if (!rec) return { ok: false, error: "Recorrência não encontrada." };
    const current = rec.template as RecurrenceTemplate;

    // Trocar de conta passa pela mesma regra do "Mover" (quem pode, e
    // previsões juntas).
    if (accountId && accountId !== current.account_id) {
      const { error } = await supabase.rpc("move_recurrence", {
        p_recurrence_id: recurrenceId,
        p_account_id: accountId,
      });
      if (error) return { ok: false, error: error.message };
    }

    const template: RecurrenceTemplate = {
      ...current,
      account_id: accountId || current.account_id,
      description,
      amount_cents: amountCents,
      category_id: categoryId,
    };
    const { data: updated, error: updateError } = await supabase
      .from("recurrences")
      .update({
        template,
        frequency,
        starts_on: nextDate,
        day_of_month: frequency === "monthly" ? Number(nextDate.slice(8, 10)) : null,
        ends_on: endsOn,
      })
      .eq("id", recurrenceId)
      .select("id");
    if (updateError) return { ok: false, error: updateError.message };
    if (!updated || updated.length === 0) {
      return { ok: false, error: "Você não pode editar essa recorrência (é de uma conta pessoal de outra pessoa)." };
    }

    const changed = await replaceFutureOccurrences({ recurrenceId, householdId, memberId, from: today });

    revalidatePath("/a-pagar");
    revalidatePath("/transacoes");
    revalidatePath("/mes");
    revalidatePath("/fluxo-de-caixa");
    revalidatePath("/contas");
    return { ok: true, changed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}
