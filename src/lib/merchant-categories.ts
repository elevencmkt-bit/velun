import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDescription } from "@/lib/fingerprint";
import { cleanBankDescription } from "@/lib/import/clean-description";

// Categoria lembrada por estabelecimento.
//
// Pôs um Publix em Mercado: os outros Publix SEM categoria vão junto, e a
// próxima importação já chega com Mercado. Mesma chave do nome lembrado
// (merchant-names.ts): o nome limpo automático, normalizado — "PUBLIX
// #2022" e "PUBLIX SUPER MAR 2435" viram a mesma coisa.
//
// Regras que não mudam:
// - Só preenche o que está vazio ou foi sugerido automaticamente. O que a
//   pessoa escolheu na mão nunca é sobrescrito.
// - Por pessoa, como os nomes: não vira pista pro outro de onde ela compra.
// - Entrada e saída são lembradas separadas (compra x reembolso).

type Direction = "in" | "out";

/** Chave do estabelecimento a partir do texto do banco. */
export function merchantKey(bankDescription: string): string {
  return normalizeDescription(cleanBankDescription(bankDescription));
}

function mapKey(key: string, direction: Direction) {
  return `${direction}|${key}`;
}

export type LearnedCategories = Map<string, string>;

export async function loadMerchantCategories(
  supabase: SupabaseClient,
  memberId: string,
): Promise<LearnedCategories> {
  const { data } = await supabase
    .from("merchant_categories")
    .select("bank_key, direction, category_id")
    .eq("member_id", memberId);
  return new Map(
    (data ?? []).map((r) => [
      mapKey(r.bank_key as string, r.direction as Direction),
      r.category_id as string,
    ]),
  );
}

export function learnedCategoryFor(
  learned: LearnedCategories,
  bankDescription: string,
  direction: Direction,
): string | null {
  const key = merchantKey(bankDescription);
  if (!key) return null;
  return learned.get(mapKey(key, direction)) ?? null;
}

/**
 * Das linhas dadas, quais são do mesmo estabelecimento e direção que a
 * linha de referência e podem receber a categoria dela (não foram
 * escolhidas na mão). A própria referência fica de fora.
 */
export function sameMerchantRows<
  T extends { id: string; bankDescription: string; direction: Direction; locked: boolean },
>(rows: T[], reference: { id: string; bankDescription: string; direction: Direction }): T[] {
  const key = merchantKey(reference.bankDescription);
  if (!key) return [];
  return rows.filter(
    (r) =>
      r.id !== reference.id &&
      !r.locked &&
      r.direction === reference.direction &&
      merchantKey(r.bankDescription) === key,
  );
}

/**
 * Lembra (ou esquece, com categoryId null) a categoria do
 * estabelecimento. Falha aqui não impede a troca de categoria que a
 * pessoa fez: no pior caso a próxima importação vem sem sugestão.
 */
export async function rememberMerchantCategory(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    memberId: string;
    bankDescription: string;
    direction: Direction;
    categoryId: string | null;
  },
) {
  const key = merchantKey(params.bankDescription);
  if (!key) return;

  if (!params.categoryId) {
    await supabase
      .from("merchant_categories")
      .delete()
      .eq("member_id", params.memberId)
      .eq("bank_key", key)
      .eq("direction", params.direction);
    return;
  }

  await supabase.from("merchant_categories").upsert(
    {
      household_id: params.householdId,
      member_id: params.memberId,
      bank_key: key,
      direction: params.direction,
      category_id: params.categoryId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id,bank_key,direction" },
  );
}
