"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";
import { computeFingerprint } from "@/lib/fingerprint";

export async function createTransaction(formData: FormData) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const accountId = String(formData.get("account_id") ?? "");
  const categoryIdRaw = String(formData.get("category_id") ?? "");
  const categoryId = categoryIdRaw || null;
  const date = String(formData.get("date") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const isPending = formData.get("is_pending") === "on";
  const amountInput = String(formData.get("amount") ?? "");

  if (!accountId) throw new Error("Conta é obrigatória.");
  if (direction !== "in" && direction !== "out") throw new Error("Direção inválida.");
  if (!date) throw new Error("Data é obrigatória.");
  if (!description) throw new Error("Descrição é obrigatória.");

  const amountCents = parseToCents(amountInput);
  if (amountCents <= 0) throw new Error("Valor precisa ser maior que zero.");

  // Verifica que a conta pertence ao household do usuário — RLS já
  // impede o insert, mas aqui dá um erro legível em vez de 403 mudo.
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!account) throw new Error("Conta não encontrada neste household.");

  const fingerprint = computeFingerprint({ accountId, date, amountCents, description });

  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: accountId,
    category_id: categoryId,
    date,
    amount_cents: amountCents,
    direction,
    description,
    notes,
    status: isPending ? "pending" : "cleared",
    fingerprint,
    created_by: memberId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
}

export async function updateTransactionCategory(transactionId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", transactionId);

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
}

export async function bulkUpdateCategory(transactionIds: string[], categoryId: string | null) {
  if (transactionIds.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .in("id", transactionIds);

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
}
