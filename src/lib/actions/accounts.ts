"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";

const ACCOUNT_TYPES = ["checking", "savings", "credit_card", "cash", "investment"] as const;

export async function createAccount(formData: FormData) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const openingBalanceInput = String(formData.get("opening_balance") ?? "0");

  if (!name) throw new Error("Nome da conta é obrigatório.");
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    throw new Error("Tipo de conta inválido.");
  }

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    name,
    type,
    institution,
    opening_balance_cents: parseToCents(openingBalanceInput || "0"),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
}

export async function updateAccount(accountId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const openingBalanceInput = String(formData.get("opening_balance") ?? "0");

  if (!name) throw new Error("Nome da conta é obrigatório.");
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    throw new Error("Tipo de conta inválido.");
  }

  const { error } = await supabase
    .from("accounts")
    .update({
      name,
      type,
      institution,
      opening_balance_cents: parseToCents(openingBalanceInput || "0"),
    })
    .eq("id", accountId);

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
}

export async function archiveAccount(accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: true })
    .eq("id", accountId);

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
}

export async function unarchiveAccount(accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: false })
    .eq("id", accountId);

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
}
