// Parser da fatura do cartão Nubank (PDF).
//
// Puro: entra o texto extraído do PDF, sai a fatura. As armadilhas:
//
// 1. Datas sem ano ("11 SET"). O ano sai do vencimento ("FATURA 21 SET
//    2026") e do fechamento: lançamento com mês depois do fechamento é do
//    ano anterior (fatura que fecha em janeiro traz compras de dezembro).
// 2. O valor nem sempre está na linha da data: juros e IOF vêm com uma ou
//    duas linhas de explicação no meio — que também têm "R$" — e o valor
//    numa linha sozinha depois.
// 3. Crédito vem com o sinal de menos tipográfico ("−R$ 117,13"), não o
//    hífen.
// 4. "Saldo em atraso" + "Crédito de atraso" é o banco rolando a fatura
//    anterior não paga pra esta: um par que se anula. O Velun já carrega o
//    que ficou sem pagar de uma fatura pra outra, então o par fica de fora.

import {
  StatementParseError,
  type ParsedStatement,
  type ParsedTransaction,
} from "./regions-pdf";

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};
const MONTH_RE = "(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)";

export type ParsedCardStatement = ParsedStatement & {
  kind: "card";
  issuer: "nubank";
  dueDate: string;
  /** "Total a pagar" da fatura. */
  totalCents: number;
  /** "Fatura anterior". */
  previousCents: number;
  /** "Pagamento recebido". */
  paymentsCents: number;
};

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "1.234,56" → 123456. */
function brlToCents(raw: string): number {
  const clean = raw.replace(/\./g, "").replace(",", ".");
  return Math.round(Number.parseFloat(clean) * 100);
}

function moneyAfter(label: RegExp, text: string): number | null {
  const m = text.match(
    new RegExp(`${label.source}\\s*R\\$\\s*([\\d.]+,\\d{2})`, "i"),
  );
  return m ? brlToCents(m[1]) : null;
}

export function looksLikeNubank(text: string) {
  return (
    /Nu Pagamentos|nubank/i.test(text) &&
    /TRANSA[CÇ][OÕ]ES\s+DE\s+\d{2}\s+[A-Z]{3}\s+A\s+\d{2}\s+[A-Z]{3}/i.test(
      text,
    )
  );
}

const SKIP_PAIR = /^(saldo em atraso|cr[ée]dito de atraso)$/i;
const AMOUNT_ONLY = /^([−-])?\s*R\$\s*([\d.]+,\d{2})$/;
const AMOUNT_AT_END = /\s+([−-])?\s*R\$\s*([\d.]+,\d{2})$/;

export function parseNubankStatementText(text: string): ParsedCardStatement {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());

  const due = text.match(
    new RegExp(`FATURA\\s+(\\d{2})\\s+${MONTH_RE}\\s+(\\d{4})`, "i"),
  );
  const period = text.match(
    new RegExp(
      `TRANSA[CÇ][OÕ]ES\\s+DE\\s+(\\d{2})\\s+${MONTH_RE}\\s+A\\s+(\\d{2})\\s+${MONTH_RE}`,
      "i",
    ),
  );
  if (!due || !period) {
    throw new StatementParseError(
      "Não reconheci essa fatura. Em PDF o Velun lê a do Nubank; de outro cartão, baixe o OFX/QFX ou o CSV no site do banco.",
    );
  }

  const dueMonth = MONTHS[due[2].toUpperCase()];
  const dueYear = Number(due[3]);
  const closeDay = Number(period[3]);
  const closeMonth = MONTHS[period[4].toUpperCase()];
  const closeYear = closeMonth > dueMonth ? dueYear - 1 : dueYear;
  const startDay = Number(period[1]);
  const startMonth = MONTHS[period[2].toUpperCase()];
  const startYear = startMonth > closeMonth ? closeYear - 1 : closeYear;

  const yearFor = (month: number) =>
    month > closeMonth ? closeYear - 1 : closeYear;

  const start = lines.findIndex((l) => /^TRANSA[CÇ][OÕ]ES\s+DE\s/i.test(l));
  const transactions: ParsedTransaction[] = [];
  const dateLine = new RegExp(`^(\\d{2})\\s+${MONTH_RE}\\s+(.+)$`, "i");

  let pending: { date: string; description: string } | null = null;
  const push = (
    date: string,
    description: string,
    sign: string | undefined,
    raw: string,
  ) => {
    const cents = brlToCents(raw);
    if (cents === 0 || SKIP_PAIR.test(description)) return;
    transactions.push({
      date,
      description,
      amountCents: cents,
      // Com sinal de menos é crédito (estorno, pagamento): diminui a fatura.
      direction: sign ? "in" : "out",
      mcc: null,
    });
  };

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const dated = line.match(dateLine);
    if (dated) {
      const month = MONTHS[dated[2].toUpperCase()];
      const date = iso(yearFor(month), month, Number(dated[1]));
      const rest = dated[3];
      const amount = rest.match(AMOUNT_AT_END);
      if (amount) {
        push(
          date,
          rest.replace(AMOUNT_AT_END, "").trim(),
          amount[1],
          amount[2],
        );
        pending = null;
      } else {
        pending = { date, description: rest.trim() };
      }
      continue;
    }

    const alone = line.match(AMOUNT_ONLY);
    if (alone && pending) {
      push(pending.date, pending.description, alone[1], alone[2]);
      pending = null;
    }
    // Qualquer outra linha (explicação de juros, subtotal por pessoa ou
    // por grupo, cabeçalho de página) é ignorada.
  }

  const totalCents = moneyAfter(/Total a pagar/, text);
  if (totalCents === null) {
    throw new StatementParseError("Não achei o total a pagar nessa fatura.");
  }

  return {
    kind: "card",
    issuer: "nubank",
    periodStart: iso(startYear, startMonth, startDay),
    periodEnd: iso(closeYear, closeMonth, closeDay),
    dueDate: iso(dueYear, dueMonth, Number(due[1])),
    totalCents,
    previousCents: moneyAfter(/Fatura anterior/, text) ?? 0,
    paymentsCents: moneyAfter(/Pagamento recebido/, text) ?? 0,
    // Num cartão, saldo é dívida (negativo). Estes dois campos só existem
    // pra caber no formato do extrato da corrente.
    beginningBalanceCents: 0,
    endingBalanceCents: -totalCents,
    transactions,
    dailyBalances: [],
  };
}

/**
 * Conferência: a soma das linhas (compras − estornos − pagamentos) tem
 * que bater com total − fatura anterior. O Nubank
 * arredonda centavos de juros em lugares diferentes, então aceita até 5
 * centavos de diferença.
 */
export function verifyCardStatement(statement: ParsedCardStatement) {
  const extracted = statement.transactions.reduce(
    (sum, t) => sum + (t.direction === "out" ? t.amountCents : -t.amountCents),
    0,
  );
  const expected = statement.totalCents - statement.previousCents;
  return {
    matches: Math.abs(extracted - expected) <= 5,
    extractedSumCents: extracted,
    expectedCents: expected,
  };
}
