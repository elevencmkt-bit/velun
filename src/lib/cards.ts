import type { SupabaseClient } from "@supabase/supabase-js";
import { accountScope } from "@/lib/visibility";
import {
  buildStatements,
  currentDebt,
  closingFor,
  type CardTransaction,
  type Statement,
} from "@/lib/credit-card";

export type CardSummary = {
  id: string;
  name: string;
  institution: string | null;
  lastFour: string | null;
  color: string;
  limitCents: number | null;
  closeDay: number;
  dueDay: number;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  ownerId: string | null;
  /** "Minha", "Do casal" ou o nome de quem é dono. */
  ownerLabel: string;
  /** Conta do casal ou minha: posso lançar e pagar. */
  canEdit: boolean;
  /** Posso ver compra por compra (nível "aberta"); senão só os totais. */
  canSeeTransactions: boolean;
  statements: Statement[];
  /** Fatura aberta agora. */
  current: Statement;
  /** Última fatura já fechada, se houver. */
  lastClosed: Statement | null;
  debtCents: number;
};

/**
 * Cartões que quem está vendo pode enxergar, com as faturas calculadas.
 *
 * Totais de fatura seguem o nível de SALDO (como o saldo de uma conta:
 * quem mostra "só o saldo" mostra quanto deve no cartão). A lista de
 * compras segue o nível de lançamentos — só cartão "aberto".
 */
export async function loadCards(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string,
  today: string,
): Promise<CardSummary[]> {
  const [balanceScope, txScope] = await Promise.all([
    accountScope(supabase, householdId, memberId, "balance"),
    accountScope(supabase, householdId, memberId, "transactions"),
  ]);
  if (balanceScope.ids.length === 0) return [];

  const { data: cards, error } = await supabase
    .from("accounts")
    .select(
      "id, name, institution, owner_id, opening_balance_cents, credit_limit_cents, statement_close_day, payment_due_day, payment_account_id, last_four, card_color",
    )
    .eq("household_id", householdId)
    .eq("type", "credit_card")
    .eq("is_archived", false)
    .in("id", balanceScope.ids)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  if (!cards || cards.length === 0) return [];

  const ids = cards.map((c) => c.id as string);
  const paymentIds = cards
    .map((c) => c.payment_account_id as string | null)
    .filter(Boolean) as string[];

  const [{ data: txs, error: txError }, { data: payers }, { data: members }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, account_id, date, amount_cents, direction, transfer_group_id, installment_group_id",
        )
        .eq("household_id", householdId)
        .in("account_id", ids)
        .order("date"),
      paymentIds.length > 0
        ? supabase.from("accounts").select("id, name").in("id", paymentIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase
        .from("members")
        .select("id, display_name")
        .eq("household_id", householdId),
    ]);
  if (txError) throw new Error(txError.message);

  const payerNames = new Map(
    (payers ?? []).map((p) => [p.id as string, p.name as string]),
  );
  const memberNames = new Map(
    (members ?? []).map((m) => [m.id as string, m.display_name as string]),
  );
  const txSet = new Set(txScope.ids);

  return cards.map((card) => {
    const closeDay = (card.statement_close_day as number | null) ?? 28;
    const dueDay = (card.payment_due_day as number | null) ?? 22;
    const settings = {
      closeDay,
      dueDay,
      openingBalanceCents: card.opening_balance_cents as number,
    };
    const own = (txs ?? []).filter(
      (t) => t.account_id === card.id,
    ) as (CardTransaction & { account_id: string })[];
    const statements = buildStatements(own, settings, today);
    const currentClosing = closingFor(today, closeDay);
    const current =
      statements.find((s) => s.closing === currentClosing) ??
      statements[statements.length - 1];
    const closed = statements.filter((s) => s.closing < today);
    const ownerId = card.owner_id as string | null;

    return {
      id: card.id as string,
      name: card.name as string,
      institution: (card.institution as string | null) ?? null,
      lastFour: (card.last_four as string | null) ?? null,
      color: (card.card_color as string | null) ?? "ink",
      limitCents: (card.credit_limit_cents as number | null) ?? null,
      closeDay,
      dueDay,
      paymentAccountId: (card.payment_account_id as string | null) ?? null,
      paymentAccountName: card.payment_account_id
        ? (payerNames.get(card.payment_account_id as string) ?? null)
        : null,
      ownerId,
      ownerLabel:
        ownerId === null
          ? "Do casal"
          : ownerId === memberId
            ? "Minha"
            : (memberNames.get(ownerId) ?? "Pessoal"),
      canEdit: ownerId === null || ownerId === memberId,
      canSeeTransactions: txSet.has(card.id as string),
      statements,
      current,
      lastClosed: closed.length > 0 ? closed[closed.length - 1] : null,
      debtCents: currentDebt(own, settings, today),
    };
  });
}

/**
 * Faturas a pagar pra A vencer e pro fluxo de caixa: a última fechada
 * que ainda tem saldo (ela já carrega o que sobrou das anteriores) e a
 * aberta, como previsão no vencimento dela.
 */
export function cardBills(cards: CardSummary[]) {
  const bills: {
    id: string;
    cardId: string;
    cardName: string;
    color: string;
    date: string;
    amountCents: number;
    status: Statement["status"];
    closing: string;
    canEdit: boolean;
    paymentAccountName: string | null;
  }[] = [];
  for (const card of cards) {
    const last = card.lastClosed;
    if (last && last.remainingCents > 0) {
      bills.push({
        id: `${card.id}:${last.closing}`,
        cardId: card.id,
        cardName: card.name,
        color: card.color,
        date: last.due,
        amountCents: last.remainingCents,
        status: last.status,
        closing: last.closing,
        canEdit: card.canEdit,
        paymentAccountName: card.paymentAccountName,
      });
    }
    // A aberta: o que já está nela além do que a fechada vai cobrar.
    const carried = last ? last.remainingCents : 0;
    const openAmount = Math.max(0, card.current.totalCents - carried);
    if (card.current.status === "open" && openAmount > 0) {
      bills.push({
        id: `${card.id}:${card.current.closing}`,
        cardId: card.id,
        cardName: card.name,
        color: card.color,
        date: card.current.due,
        amountCents: openAmount,
        status: "open",
        closing: card.current.closing,
        canEdit: card.canEdit,
        paymentAccountName: card.paymentAccountName,
      });
    }
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Faturas a pagar dos cartões dentro de um escopo de contas — pro fluxo
 * de caixa, que não sabe quem está vendo, só quais contas entram.
 * Devolve também os ids dos cartões, que ficam fora do saldo em dinheiro.
 */
export async function cardBillsForScope(
  supabase: SupabaseClient,
  householdId: string,
  scopeIds: string[],
  today: string,
) {
  if (scopeIds.length === 0)
    return {
      cardIds: new Set<string>(),
      bills: [] as ReturnType<typeof cardBills>,
    };
  const { data: cards } = await supabase
    .from("accounts")
    .select(
      "id, name, opening_balance_cents, statement_close_day, payment_due_day, card_color, owner_id",
    )
    .eq("household_id", householdId)
    .eq("type", "credit_card")
    .in("id", scopeIds);
  const cardIds = new Set((cards ?? []).map((c) => c.id as string));
  if (!cards || cards.length === 0)
    return { cardIds, bills: [] as ReturnType<typeof cardBills> };

  const { data: txs } = await supabase
    .from("transactions")
    .select("id, account_id, date, amount_cents, direction, transfer_group_id")
    .eq("household_id", householdId)
    .in("account_id", [...cardIds])
    .order("date");

  const summaries = cards.map((card) => {
    const closeDay = (card.statement_close_day as number | null) ?? 28;
    const dueDay = (card.payment_due_day as number | null) ?? 22;
    const settings = {
      closeDay,
      dueDay,
      openingBalanceCents: card.opening_balance_cents as number,
    };
    const own = (txs ?? []).filter(
      (t) => t.account_id === card.id,
    ) as CardTransaction[];
    const statements = buildStatements(own, settings, today);
    const currentClosing = closingFor(today, closeDay);
    const current =
      statements.find((s) => s.closing === currentClosing) ??
      statements[statements.length - 1];
    const closed = statements.filter((s) => s.closing < today);
    return {
      id: card.id as string,
      name: card.name as string,
      color: (card.card_color as string | null) ?? "ink",
      paymentAccountName: null,
      canEdit: false,
      current,
      lastClosed: closed.length > 0 ? closed[closed.length - 1] : null,
    } as unknown as CardSummary;
  });

  return { cardIds, bills: cardBills(summaries) };
}
