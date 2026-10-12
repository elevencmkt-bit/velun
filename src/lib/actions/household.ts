"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import type { CurrencyCode } from "@/lib/money";
import { COUNTRY_LABELS, TIMEZONES, type CountryCode } from "@/lib/household-settings";

const VALID_CURRENCIES: CurrencyCode[] = ["BRL", "USD", "EUR"];

export type HouseholdSettingsResult = { ok: true } | { ok: false; error: string };

/**
 * País, fuso e moeda da casa. Devolve resultado em vez de lançar erro:
 * em produção o Next esconde a mensagem de erro de server action, e a
 * tela ficaria sem dizer o que deu errado.
 */
export async function updateHouseholdSettings(input: {
  country: CountryCode;
  timezone: string;
  currency: CurrencyCode;
}): Promise<HouseholdSettingsResult> {
  if (!(input.country in COUNTRY_LABELS)) return { ok: false, error: "País inválido." };
  if (!TIMEZONES.some((t) => t.value === input.timezone)) return { ok: false, error: "Fuso inválido." };
  if (!VALID_CURRENCIES.includes(input.currency)) return { ok: false, error: "Moeda inválida." };

  const { householdId } = await getCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("households")
    .update({ country: input.country, timezone: input.timezone, currency: input.currency })
    .eq("id", householdId)
    .select("id");

  if (error) return { ok: false, error: `Não foi possível salvar: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: "Não foi possível salvar (permissão negada)." };

  revalidateEverything();
  return { ok: true };
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
