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

  const isCard = type === "credit_card";
  const openingCents = parseToCents(openingBalanceInput || "0");

  return {
    name,
    type,
    institution,
    // No cartão, o campo pergunta "quanto você deve hoje": dívida é saldo
    // negativo.
    opening_balance_cents: isCard ? -Math.abs(openingCents) : openingCents,
    ...readCardFields(formData, isCard),
    // O dono é sempre quem está logado: ninguém cria nem transfere uma
    // conta pessoal no nome do outro membro.
    owner_id: isPersonal ? memberId : null,
    visibility: isPersonal ? visibilityInput : "shared",
  };
}

const CARD_COLORS = ["ink", "blue", "green", "coral", "purple"] as const;

function readDay(formData: FormData, field: string, label: string) {
  const raw = String(formData.get(field) ?? "").trim();
  const day = Number(raw);
  if (!raw || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${label}: escolha um dia de 1 a 31.`);
  }
  return day;
}

// Campos que só fazem sentido em cartão. Em outro tipo de conta, ficam
// vazios — trocar um cartão pra conta corrente apaga o fechamento etc.
function readCardFields(formData: FormData, isCard: boolean) {
  if (!isCard) {
    return {
      credit_limit_cents: null,
      statement_close_day: null,
      payment_due_day: null,
      payment_account_id: null,
      last_four: null,
      card_color: null,
    };
  }
  const limitRaw = String(formData.get("credit_limit") ?? "").trim();
  const limit = limitRaw ? parseToCents(limitRaw) : null;
  if (limit !== null && limit <= 0) throw new Error("O limite precisa ser maior que zero.");
  const lastFour = String(formData.get("last_four") ?? "").trim() || null;
  if (lastFour && !/^\d{4}$/.test(lastFour)) throw new Error("Final do cartão: 4 números.");
  const color = String(formData.get("card_color") ?? "ink");
  const paymentAccount = String(formData.get("payment_account_id") ?? "").trim();

  return {
    credit_limit_cents: limit,
    statement_close_day: readDay(formData, "close_day", "Fechamento"),
    payment_due_day: readDay(formData, "due_day", "Vencimento"),
    payment_account_id: paymentAccount && paymentAccount !== "none" ? paymentAccount : null,
    last_four: lastFour,
    card_color: CARD_COLORS.includes(color as (typeof CARD_COLORS)[number]) ? color : "ink",
  };
}

// A conta que paga a fatura precisa ser da casa, não ser cartão e ser
// uma em que quem está salvando pode lançar (do casal ou dele).
async function assertPaymentAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  memberId: string,
  accountId: string | null,
) {
  if (!accountId) return;
  const { data } = await supabase
    .from("accounts")
    .select("id, type, owner_id")
    .eq("household_id", householdId)
    .eq("id", accountId)
    .maybeSingle();
  if (!data || data.type === "credit_card" || (data.owner_id !== null && data.owner_id !== memberId)) {
    throw new Error("A conta que paga a fatura precisa ser uma conta corrente sua ou do casal.");
  }
}

export async function createAccount(formData: FormData) {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const fields = readAccountFields(formData, memberId);
  await assertPaymentAccount(supabase, householdId, memberId, fields.payment_account_id);

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    ...fields,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
  revalidatePath("/cartoes");
  revalidatePath("/mes");
}

export async function updateAccount(accountId: string, formData: FormData) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const fields = readAccountFields(formData, memberId);
  if (fields.payment_account_id === accountId) throw new Error("O cartão não pode pagar a si mesmo.");
  await assertPaymentAccount(supabase, householdId, memberId, fields.payment_account_id);

  const { error } = await supabase.from("accounts").update(fields).eq("id", accountId);

  if (error) throw new Error(error.message);

  // Mudar o nível muda o que o outro membro vê em todas as telas, não só
  // em /contas.
  revalidatePath("/contas");
  revalidatePath("/cartoes");
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
  revalidatePath("/cartoes");
}

export async function unarchiveAccount(accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: false })
    .eq("id", accountId);

  if (error) throw new Error(error.message);

  revalidatePath("/contas");
  revalidatePath("/cartoes");
}
