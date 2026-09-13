"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { findPaletteColorByFg } from "@/lib/category-colors";

// "" (não NULL, a coluna é NOT NULL) marca "sem cor manual" — a cor
// real é derivada automaticamente em category-colors.ts. Categorias
// antigas guardam um hex fixo de antes dessa tela existir; como não
// bate com nenhuma entrada da paleta, também caem no fallback.
const NO_MANUAL_COLOR = "";

function revalidateCategoryPaths() {
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/a-pagar");
  revalidatePath("/relatorios");
  revalidatePath("/configuracoes");
}

export async function createCategory(formData: FormData) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense");
  const colorInput = formData.get("color");
  const color = typeof colorInput === "string" ? colorInput : null;

  if (!name) throw new Error("Nome da categoria é obrigatório.");
  if (kind !== "income" && kind !== "expense") throw new Error("Tipo de categoria inválido.");

  // Cor manual só faz sentido pra despesa — receita é sempre o verde
  // fixo de INCOME_COLOR, então qualquer valor aqui é ignorado.
  if (kind === "expense" && color && !findPaletteColorByFg(color)) {
    throw new Error("Cor inválida.");
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name,
      kind,
      color: kind === "expense" && color ? color : NO_MANUAL_COLOR,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();

  return data.id as string;
}

export async function updateCategoryName(categoryId: string, name: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome da categoria é obrigatório.");

  const { error } = await supabase
    .from("categories")
    .update({ name: trimmed })
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}

// `color` deve ser um dos `fg` da CATEGORY_PALETTE, ou null para voltar
// pro fallback automático — só categorias de despesa podem ter cor
// manual (receita usa sempre o verde fixo de INCOME_COLOR).
export async function updateCategoryColor(categoryId: string, color: string | null) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  if (color !== null && !findPaletteColorByFg(color)) {
    throw new Error("Cor inválida.");
  }

  const { error } = await supabase
    .from("categories")
    .update({ color: color ?? NO_MANUAL_COLOR })
    .eq("id", categoryId)
    .eq("household_id", householdId)
    .eq("kind", "expense");

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}

export async function deleteCategory(categoryId: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  // transactions.category_id é ON DELETE SET NULL — lançamentos que
  // usavam essa categoria passam a "Sem categoria", nada quebra.
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}
