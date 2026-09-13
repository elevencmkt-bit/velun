"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";

const PALETTE = { income: "#2F6B4F", expense: "#B2402F" } as const;

export async function createCategory(formData: FormData) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense");

  if (!name) throw new Error("Nome da categoria é obrigatório.");
  if (kind !== "income" && kind !== "expense") throw new Error("Tipo de categoria inválido.");

  const { data, error } = await supabase
    .from("categories")
    .insert({ household_id: householdId, name, kind, color: PALETTE[kind] })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");

  return data.id as string;
}
