import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDescription } from "@/lib/fingerprint";
import { cleanBankDescription, isGenericBankText } from "@/lib/import/clean-description";

/**
 * Lembra o nome que a pessoa deu a um estabelecimento, pra próxima
 * importação já vir com ele.
 *
 * A chave é o nome limpo automático ("Facebook"), não o texto cru do
 * banco: o texto cru muda a cada compra (número do pedido, referência),
 * o nome limpo não. Voltar pro nome automático apaga a lembrança.
 *
 * Falha aqui não deve impedir o que a pessoa estava fazendo (renomear),
 * então o erro é engolido: no pior caso a próxima importação vem com o
 * nome automático.
 */
export async function rememberMerchantName(
  supabase: SupabaseClient,
  params: { householdId: string; memberId: string; bankDescription: string; name: string },
) {
  const automatic = cleanBankDescription(params.bankDescription);
  const key = normalizeDescription(automatic);
  const name = params.name.trim();
  if (!key || isGenericBankText(params.bankDescription)) return;

  if (!name || normalizeDescription(name) === key) {
    await supabase.from("merchant_names").delete().eq("member_id", params.memberId).eq("bank_key", key);
    return;
  }

  await supabase.from("merchant_names").upsert(
    {
      household_id: params.householdId,
      member_id: params.memberId,
      bank_key: key,
      name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id,bank_key" },
  );
}
