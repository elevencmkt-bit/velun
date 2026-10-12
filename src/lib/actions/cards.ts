"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { computeFingerprint } from "@/lib/fingerprint";
import { parseToCents } from "@/lib/money";

export type PayResult = { ok: true } | { ok: false; error: string };

/**
 * Paga (toda ou parte de) uma fatura: uma transferência da conta que paga
 * pro cartão. Transferência não é gasto — o gasto já foi contado em cada
 * compra —, então pagar a fatura não infla os relatórios.
 */
export async function payCardBill(input: {
  cardId: string;
  fromAccountId: string;
  date: string;
  amount: string;
}): Promise<PayResult> {
  // Fora do try: sem sessão, isto redireciona pro login, e o redirect do
  // Next não pode ser engolido pelo catch.
  const { householdId, memberId } = await getCurrentMember();
  try {
    const supabase = await createClient();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Data inválida." };
    let amountCents: number;
    try {
      amountCents = parseToCents(input.amount);
    } catch {
      return { ok: false, error: "Valor inválido." };
    }
    if (amountCents <= 0) return { ok: false, error: "O valor precisa ser maior que zero." };

    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name, type, owner_id, is_archived")
      .eq("household_id", householdId)
      .in("id", [input.cardId, input.fromAccountId]);
    const card = accounts?.find((a) => a.id === input.cardId);
    const from = accounts?.find((a) => a.id === input.fromAccountId);
    const mine = (a: { owner_id: string | null }) => a.owner_id === null || a.owner_id === memberId;

    if (!card || card.type !== "credit_card" || !mine(card)) {
      return { ok: false, error: "Cartão não encontrado." };
    }
    if (!from || from.type === "credit_card" || from.is_archived || !mine(from)) {
      return { ok: false, error: "Escolha uma conta sua ou do casal pra pagar." };
    }

    const description = `Pagamento da fatura · ${card.name}`;
    const { error } = await supabase.rpc("create_transfer", {
      p_household_id: householdId,
      p_from_account_id: from.id,
      p_to_account_id: card.id,
      p_date: input.date,
      p_amount_cents: amountCents,
      p_description: description,
      p_notes: null,
      p_created_by: memberId,
      p_from_fingerprint: computeFingerprint({ accountId: from.id, date: input.date, amountCents, description }),
      p_to_fingerprint: computeFingerprint({ accountId: card.id, date: input.date, amountCents, description }),
    });
    if (error) return { ok: false, error: `Não consegui registrar o pagamento: ${error.message}` };

    for (const path of ["/cartoes", "/a-pagar", "/mes", "/contas", "/transacoes", "/fluxo-de-caixa"]) {
      revalidatePath(path);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao pagar a fatura." };
  }
}
