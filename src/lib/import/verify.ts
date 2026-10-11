import type { ParsedStatement } from "./regions-pdf";

// Conferência da extração contra o próprio extrato.
//
// Esta é a peça que torna importação automática confiável em vez de
// aposta. Não basta somar e comparar com o saldo final: o extrato da
// Regions traz o saldo DIA A DIA, então dá pra reconstruir a conta dia
// por dia e apontar o dia exato em que a extração divergiu — em vez de
// só avisar que algo está errado em algum lugar.

export type VerificationResult = {
  matches: boolean;
  extractedSumCents: number;
  expectedEndingCents: number;
  computedEndingCents: number;
  /** Primeiro dia em que o saldo reconstruído difere do extrato. */
  firstDivergence: {
    date: string;
    expectedCents: number;
    computedCents: number;
  } | null;
};

export function verifyStatement(statement: ParsedStatement): VerificationResult {
  const delta = (direction: "in" | "out", cents: number) =>
    direction === "in" ? cents : -cents;

  const extractedSumCents = statement.transactions.reduce(
    (sum, t) => sum + delta(t.direction, t.amountCents),
    0,
  );
  const computedEndingCents = statement.beginningBalanceCents + extractedSumCents;

  // Saldo reconstruído ao fim de cada dia que teve movimento.
  const byDate = new Map<string, number>();
  for (const t of statement.transactions) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + delta(t.direction, t.amountCents));
  }

  let running = statement.beginningBalanceCents;
  const computedDaily = new Map<string, number>();
  for (const date of [...byDate.keys()].sort()) {
    running += byDate.get(date) ?? 0;
    computedDaily.set(date, running);
  }

  let firstDivergence: VerificationResult["firstDivergence"] = null;
  for (const entry of [...statement.dailyBalances].sort((a, b) => a.date.localeCompare(b.date))) {
    const computed = computedDaily.get(entry.date);
    // Um dia que o extrato lista e a extração não viu também é divergência:
    // significa que o lançamento daquele dia se perdeu.
    if (computed === undefined || computed !== entry.balanceCents) {
      firstDivergence = {
        date: entry.date,
        expectedCents: entry.balanceCents,
        computedCents: computed ?? running,
      };
      break;
    }
  }

  return {
    matches: computedEndingCents === statement.endingBalanceCents && firstDivergence === null,
    extractedSumCents,
    expectedEndingCents: statement.endingBalanceCents,
    computedEndingCents,
    firstDivergence,
  };
}
