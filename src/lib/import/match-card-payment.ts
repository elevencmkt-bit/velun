// Linha do extrato da corrente que é pagamento de fatura de cartão.
//
// Pagar a fatura não é gasto: o gasto foi cada compra no cartão. Se a
// linha "Payment to card" do extrato entrasse como despesa comum, o mês
// contaria o mesmo dinheiro duas vezes. Então ela vira transferência da
// corrente pro cartão — e a fatura fica paga.
//
// Dois casos:
//
// 1. Já registrado: a pessoa apertou "Pagar fatura" no app antes de
//    importar. Existe uma transferência da corrente pro cartão com o
//    mesmo valor e data próxima. A linha é o mesmo dinheiro: entra como
//    duplicata (desmarcada).
//
// 2. Pagamento novo: o valor bate exatamente com uma fatura fechada
//    (total ou o que falta), na janela entre o fechamento e alguns dias
//    depois do vencimento → sugestão MARCADA. Valor diferente (pagamento
//    parcial), mas a descrição tem cara de pagamento de cartão e só há um
//    cartão possível → sugestão DESMARCADA, pra quem revisa decidir.

export type CardForMatch = {
  id: string;
  name: string;
  institution: string | null;
  lastFour: string | null;
  /** Conta que paga esta fatura, se definida. */
  paymentAccountId: string | null;
  statements: {
    closing: string;
    due: string;
    totalCents: number;
    remainingCents: number;
    status: string;
  }[];
};

export type LineForMatch = {
  date: string;
  amountCents: number;
  direction: "in" | "out";
  description: string;
  free: boolean;
};

export type ExistingPayment = {
  date: string;
  amountCents: number;
};

export type CardPaymentMatch =
  | { kind: "already-registered" }
  | {
      kind: "payment";
      cardId: string;
      accepted: boolean;
      closing: string | null;
    };

/** Dias depois do vencimento em que um pagamento ainda conta pra fatura. */
export const AFTER_DUE_DAYS = 10;
const ALREADY_REGISTERED_DAYS = 7;

const PAYMENT_WORDS =
  /\b(payment|pymt|pmt|autopay|auto pay|card|credit|cartao|cartão|fatura)\b/i;

function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000,
  );
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionsCard(description: string, card: CardForMatch) {
  const d = ` ${normalize(description)} `;
  if (card.lastFour && d.includes(` ${card.lastFour} `)) return true;
  for (const label of [card.institution, card.name]) {
    if (!label) continue;
    // Primeira palavra significativa do nome do cartão/banco ("Nomad",
    // "Chase"); palavras genéricas não contam.
    const word = normalize(label)
      .split(" ")
      .find(
        (w) =>
          w.length >= 4 &&
          !["card", "cartao", "credit", "credito", "bank", "banco"].includes(w),
      );
    if (word && d.includes(` ${word} `)) return true;
  }
  return false;
}

/**
 * Pra cada linha do extrato, devolve o que ela é em relação aos cartões
 * (ou null). `accountId` é a conta do extrato.
 */
export function matchCardPayments(
  accountId: string,
  lines: LineForMatch[],
  cards: CardForMatch[],
  existing: ExistingPayment[],
): (CardPaymentMatch | null)[] {
  const takenExisting = new Set<number>();

  return lines.map((line) => {
    if (!line.free || line.direction !== "out" || cards.length === 0)
      return null;

    // 1. Já registrado à mão.
    const existingIndex = existing.findIndex(
      (e, i) =>
        !takenExisting.has(i) &&
        e.amountCents === line.amountCents &&
        Math.abs(daysBetween(e.date, line.date)) <= ALREADY_REGISTERED_DAYS,
    );
    if (existingIndex >= 0) {
      takenExisting.add(existingIndex);
      return { kind: "already-registered" };
    }

    // Cartões que esta conta pode estar pagando: os que dizem ser pagos
    // por ela, e os que a descrição cita.
    const candidates = cards.filter(
      (c) =>
        c.paymentAccountId === accountId || mentionsCard(line.description, c),
    );
    if (candidates.length === 0) return null;

    // 2a. Valor exato de uma fatura fechada, dentro da janela.
    for (const card of candidates) {
      const hit = card.statements.find(
        (s) =>
          s.status !== "open" &&
          line.date > s.closing &&
          daysBetween(line.date, s.due) <= AFTER_DUE_DAYS &&
          (s.totalCents === line.amountCents ||
            (s.remainingCents > 0 && s.remainingCents === line.amountCents)),
      );
      if (hit)
        return {
          kind: "payment",
          cardId: card.id,
          accepted: true,
          closing: hit.closing,
        };
    }

    // 2b. Parece pagamento de cartão, mas o valor não bate (parcial ou
    // adiantado): sugere desmarcado, se só houver um cartão possível.
    if (candidates.length === 1 && PAYMENT_WORDS.test(line.description)) {
      return {
        kind: "payment",
        cardId: candidates[0].id,
        accepted: false,
        closing: null,
      };
    }
    return null;
  });
}
