"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { findPaletteColorByFg } from "@/lib/category-colors";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";

const VALID_ICON_KEYS = new Set(CATEGORY_ICON_OPTIONS.map((opt) => opt.key));

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
  const iconInput = formData.get("icon");
  const icon = typeof iconInput === "string" ? iconInput : null;
  // Movimentação entre contas: serve pra entrada e saída e fica fora de
  // receita e despesa. Guardada como despesa só porque o tipo é obrigatório.
  const isTransfer = formData.get("is_transfer") === "on";
  // Subcategoria: as regras (um nível, mesmo tipo, mesma casa) o banco
  // garante (0030); aqui só lê.
  const parentInput = formData.get("parent_id");
  const parentId = typeof parentInput === "string" && parentInput ? parentInput : null;

  if (!name) throw new Error("Nome da categoria é obrigatório.");
  if (kind !== "income" && kind !== "expense") throw new Error("Tipo de categoria inválido.");

  if (color && !findPaletteColorByFg(color)) {
    throw new Error("Cor inválida.");
  }
  if (icon && !VALID_ICON_KEYS.has(icon)) {
    throw new Error("Ícone inválido.");
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name,
      kind: isTransfer ? "expense" : kind,
      color: color ?? NO_MANUAL_COLOR,
      icon,
      ...(isTransfer ? { is_transfer: true } : {}),
      ...(parentId && !isTransfer ? { parent_id: parentId } : {}),
    })
    .select("id")
    .single();

  if (error) throw new Error(friendlyCategoryError(error.message));

  revalidateCategoryPaths();

  return data.id as string;
}

// As mensagens das regras de subcategoria (0030) já vêm em português.
function friendlyCategoryError(message: string) {
  return message.replace(/^.*?(Uma categoria|Categoria principal|Subcategoria|Movimentação|A sub|Esta categoria)/, "$1");
}

/**
 * Põe uma categoria dentro de outra (vira sub) ou tira (`parentId` null,
 * volta a ser principal). Os lançamentos continuam nela; nos relatórios
 * passam a somar na principal.
 */
export async function setCategoryParent(categoryId: string, parentId: string | null) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("categories")
    .update({ parent_id: parentId })
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error(friendlyCategoryError(error.message));

  revalidateCategoryPaths();
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
// pro fallback automático (verde fixo pra receita, alfabético pra
// despesa) — vale pros dois tipos de categoria.
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
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}

// `icon` deve ser uma das chaves de CATEGORY_ICON_OPTIONS, ou null
// para voltar pro palpite automático por palavra-chave do nome.
export async function updateCategoryIcon(categoryId: string, icon: string | null) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  if (icon !== null && !VALID_ICON_KEYS.has(icon)) {
    throw new Error("Ícone inválido.");
  }

  const { error } = await supabase
    .from("categories")
    .update({ icon })
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}

export async function deleteCategory(categoryId: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  // transactions.category_id é ON DELETE SET NULL — lançamentos que
  // usavam essa categoria passam a "Sem categoria", nada quebra. Se era
  // uma SUB, o banco (0030) passa os lançamentos pra principal antes.
  // Se era principal com subs, as subs viram principais.
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
}
