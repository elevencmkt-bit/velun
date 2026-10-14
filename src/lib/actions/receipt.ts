"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { learnedCategoryFor, loadMerchantCategories } from "@/lib/merchant-categories";

/**
 * Categoria sugerida pra loja lida num recibo: a que a pessoa já ensinou
 * pra essa loja (memória por estabelecimento) ou, se não houver, a do
 * lançamento mais recente com esse nome. Só o NOME da loja chega aqui —
 * a imagem nunca sai do navegador.
 */
export async function suggestCategoryForMerchant(
  merchant: string,
  direction: "in" | "out",
): Promise<string | null> {
  const name = merchant.trim().slice(0, 60);
  if (name.length < 3) return null;
  try {
    const { householdId, memberId } = await getCurrentMember();
    const supabase = await createClient();

    const learned = await loadMerchantCategories(supabase, memberId);
    const fromMemory = learnedCategoryFor(learned, name, direction);
    if (fromMemory) return fromMemory;

    const pattern = `${name.replace(/[%_\\]/g, "")}%`;
    const { data } = await supabase
      .from("transactions")
      .select("category_id")
      .eq("household_id", householdId)
      .eq("direction", direction)
      .not("category_id", "is", null)
      .ilike("description", pattern)
      .order("date", { ascending: false })
      .limit(1);
    return (data?.[0]?.category_id as string | undefined) ?? null;
  } catch {
    return null;
  }
}
