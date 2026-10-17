import { accountScope } from "@/lib/visibility";
import { getAccountBalances } from "@/lib/balances";
import { cardBills, loadCards } from "@/lib/cards";
import { CATEGORY_JOIN, resolveJoinedCategory } from "@/lib/subcategories";
import type { EmailContext } from "./context";

// O que vence e o que entra num intervalo, por conta — a base do resumo
// da semana e dos avisos. Mesmas regras de A vencer:
//
// - entra só conta que a pessoa vê lançamento por lançamento (do casal,
//   dela, ou pessoal do outro marcada como "aberta");
// - compra no cartão não aparece sozinha: entra a fatura, no vencimento,
//   saindo da conta que paga o cartão;
// - transferência aparece uma vez (a saída, "de → pra"), mas mexe no
//   saldo das duas contas.

/** Conta em dinheiro (não cartão) que entra no e-mail. */
export type CashAccount = { id: string; name: string; balanceCents: number };

export type UpcomingItem = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  direction: "in" | "out";
  /** Conta em dinheiro afetada (fatura: a que paga o cartão). */
  accountId: string | null;
  /** O que mostrar embaixo do nome. */
  accountName: string;
  categoryName: string | null;
  /** Parte de transferência entre contas: fica fora de "sai/entra". */
  transfer: boolean;
  /** Lado de entrada de uma transferência: só mexe no saldo, não é listado. */
  silent: boolean;
  bill: boolean;
};

export async function loadUpcoming(
  ctx: EmailContext,
  from: string,
  to: string,
): Promise<{ accounts: CashAccount[]; items: UpcomingItem[] }> {
  const { supabase, householdId, memberId, today } = ctx;
  const scope = await accountScope(supabase, householdId, memberId, "transactions");
  if (scope.ids.length === 0) return { accounts: [], items: [] };

  const [{ data: accountRows, error: accountsError }, balances, { data: pending, error: pendingError }, cards] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type, is_archived")
        .eq("household_id", householdId)
        .in("id", scope.ids)
        .order("name"),
      getAccountBalances(supabase, householdId, scope),
      supabase
        // limite: pendentes de algumas semanas, poucas dezenas
        .from("transactions")
        .select(
          `id, date, description, amount_cents, direction, account_id, transfer_group_id, ${CATEGORY_JOIN}`,
        )
        .eq("household_id", householdId)
        .eq("status", "pending")
        .in("account_id", scope.ids)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true }),
      loadCards(supabase, householdId, memberId, today),
    ]);
  if (accountsError) throw new Error(accountsError.message);
  if (pendingError) throw new Error(pendingError.message);

  const all = accountRows ?? [];
  const cardIds = new Set(all.filter((a) => a.type === "credit_card").map((a) => a.id as string));
  const names = new Map(all.map((a) => [a.id as string, a.name as string]));
  const accounts: CashAccount[] = all
    .filter((a) => a.type !== "credit_card" && !a.is_archived)
    .map((a) => ({ id: a.id as string, name: a.name as string, balanceCents: balances.get(a.id as string) ?? 0 }));
  const cashIds = new Set(accounts.map((a) => a.id));

  // Destino de cada transferência, pra mostrar "de → pra".
  const transferTo = new Map<string, string>();
  for (const row of pending ?? []) {
    if (row.transfer_group_id && row.direction === "in") {
      transferTo.set(row.transfer_group_id as string, names.get(row.account_id as string) ?? "outra conta");
    }
  }

  const items: UpcomingItem[] = [];
  for (const row of pending ?? []) {
    const accountId = row.account_id as string;
    if (cardIds.has(accountId)) continue;
    const isTransfer = row.transfer_group_id !== null;
    const accountName = names.get(accountId) ?? "—";
    items.push({
      id: row.id as string,
      date: row.date as string,
      description: row.description as string,
      amountCents: row.amount_cents as number,
      direction: row.direction as "in" | "out",
      accountId: cashIds.has(accountId) ? accountId : null,
      accountName:
        isTransfer && row.direction === "out"
          ? `${accountName} → ${transferTo.get(row.transfer_group_id as string) ?? "outra conta"}`
          : accountName,
      categoryName: resolveJoinedCategory(row.category as never).name,
      transfer: isTransfer || resolveJoinedCategory(row.category as never).isTransfer,
      silent: isTransfer && row.direction === "in",
      bill: false,
    });
  }

  // Faturas dos cartões que a pessoa paga ou vê por inteiro.
  const visibleCards = cards.filter((c) => c.canEdit || c.canSeeTransactions);
  for (const b of cardBills(visibleCards)) {
    if (b.date < from || b.date > to) continue;
    const card = visibleCards.find((c) => c.id === b.cardId);
    const payer = card?.paymentAccountId && cashIds.has(card.paymentAccountId) ? card.paymentAccountId : null;
    items.push({
      id: `fatura:${b.id}`,
      date: b.date,
      description: `Fatura · ${b.cardName}`,
      amountCents: b.amountCents,
      direction: "out",
      accountId: payer,
      accountName: payer ? (names.get(payer) ?? b.cardName) : b.cardName,
      categoryName: b.status === "open" ? "fatura aberta" : "fatura fechada",
      transfer: false,
      silent: false,
      bill: true,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
  return { accounts, items };
}
