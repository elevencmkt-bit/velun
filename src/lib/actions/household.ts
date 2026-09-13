"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import type { CurrencyCode } from "@/lib/money";

const VALID_CURRENCIES: CurrencyCode[] = ["BRL", "USD", "EUR"];

export async function updateCurrency(currency: CurrencyCode) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  if (!VALID_CURRENCIES.includes(currency)) throw new Error("Moeda inválida.");

  const { data, error } = await supabase
    .from("households")
    .update({ currency })
    .eq("id", householdId)
    .select("id");

  if (error) throw new Error(error.message);
  // RLS bloqueando o update não gera erro, só devolve 0 linhas — sem
  // essa checagem a escrita falha em silêncio.
  if (!data || data.length === 0) {
    throw new Error("Não foi possível salvar a moeda (permissão negada).");
  }

  revalidateEverything();
}

function revalidateEverything() {
  for (const path of [
    "/mes",
    "/transacoes",
    "/a-pagar",
    "/fluxo-de-caixa",
    "/relatorios",
    "/contas",
    "/configuracoes",
  ]) {
    revalidatePath(path);
  }
}

// Apaga transações e recorrências, mantendo contas e categorias —
// "zerar e recomeçar a lançar" sem precisar recadastrar nada.
export async function resetTransactionsData() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { error: txError } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId);
  if (txError) throw new Error(txError.message);

  const { error: recError } = await supabase
    .from("recurrences")
    .delete()
    .eq("household_id", householdId);
  if (recError) throw new Error(recError.message);

  revalidateEverything();
}

// Reset completo: transações, recorrências, categorias e contas.
// Household e membros continuam existindo (login não é afetado) — o
// household volta ao estado de "conta nova", tudo por cadastrar de novo.
export async function resetAllData() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { error: txError } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId);
  if (txError) throw new Error(txError.message);

  const { error: recError } = await supabase
    .from("recurrences")
    .delete()
    .eq("household_id", householdId);
  if (recError) throw new Error(recError.message);

  const { error: catError } = await supabase
    .from("categories")
    .delete()
    .eq("household_id", householdId);
  if (catError) throw new Error(catError.message);

  // accounts.id é referenciado por transactions com ON DELETE RESTRICT —
  // só chega aqui depois que todas as transações já foram removidas.
  const { error: accError } = await supabase
    .from("accounts")
    .delete()
    .eq("household_id", householdId);
  if (accError) throw new Error(accError.message);

  revalidateEverything();
}
