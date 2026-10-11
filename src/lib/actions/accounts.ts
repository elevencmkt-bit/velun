"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";

const ACCOUNT_TYPES = ["checking", "savings", "credit_card", "cash", "investment"] as const;

const VISIBILITIES = ["hidden", "balance_only", "categories_only", "shared"] as const;

// Lê os campos comuns de criação e edição, incluindo a decisão de
// privacidade. Conta do casal não tem dono e é sempre `shared`; conta
// pessoal tem dono e nível escolhido — a constraint do banco recusa
// qualquer outra combinação, mas é melhor nem chegar lá.
function readAccountFields(formData: FormData, memberId: string) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const openingBalanceInput = String(formData.get("opening_balance") ?? "0");
  const ownership = String(formData.get("ownership") ?? "joint");
  const visibilityInput = String(formData.get("visibility") ?? "shared");

  if (!name) throw new Error("Nome da conta é obrigatório.");
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    throw new Error("Tipo de conta inválido.");
  }
  if (ownership !== "joint" && ownership !== "personal") {
    throw new Error("Tipo de propriedade inválido.");
  }

  const isPersonal = ownership === "personal";

  if (isPersonal && !VISIBILITIES.includes(visibilityInput as (typeof VISIBILITIES)[number])) {
    throw new Error("Nível de privacidade inválido.");
  }

  return {
    name,
    type,
    institution,
    opening_balance_cents: parseToCents(openingBalanceInput || "0"),
    // O dono é sempre quem está logado: ninguém cria nem transfere uma
    // conta pessoal no nome do outro membro.
    owner_id: isPersonal ? memberId : null,
    visibility: isPersonal ? visibilityInput : "shared",
  };
}

export async function createAccount(formData: FormData) {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    ...readAccountFields(formData, memberId),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
  revalidatePath("/mes");
}

export async function updateAccount(accountId: string, formData: FormData) {
  const { memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("accounts")
    .update(readAccountFields(formData, memberId))
    .eq("id", accountId);

  if (error) throw new Error(error.message);

  // Mudar o nível muda o que o outro membro vê em todas as telas, não só
  // em /contas.
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
  revalidatePath("/transacoes");
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
