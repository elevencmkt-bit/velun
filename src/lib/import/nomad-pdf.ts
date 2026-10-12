// Parser do "Demonstrativo de transações da conta depósito" da Nomad
// (conta em dólar, banco Community Federal Savings Bank), em PDF.
//
// Puro: entra o texto extraído do PDF, sai o extrato. Cada lançamento
// vem em três linhas:
//
//   Compra PUBLIX #2022                     ← o que foi
//   Concluído                               ← situação (às vezes com tab)
//   10/09/2026 - 09:55   - US$ 92,75        ← data, hora e valor
//
// As armadilhas:
//
// 1. Tem lançamento "Cancelado" no meio — compra recusada ou estornada
//    antes de sair. Não mexeu no saldo, então fica de fora.
// 2. Valor no formato brasileiro ("US$ 1.218,20"), sinal na frente:
//    "+" entrou, "-" saiu.
// 3. O demonstrativo não traz saldo inicial nem final do período — só o
//    saldo NA HORA em que o relatório foi gerado, que pode ser semanas
//    depois do fim do período. Então não dá pra conferir o extrato contra
//    ele mesmo como na Regions; o saldo informado vai junto pra quem
//    revisa comparar com a conta depois.
// 4. Cabeçalho e rodapé (nome, CPF, número da conta, aviso legal) se
//    repetem em toda página e são ignorados — nada disso é guardado.

import { StatementParseError, type ParsedStatement, type ParsedTransaction } from "./regions-pdf";

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

export type ParsedNomadStatement = ParsedStatement & {
  kind: "nomad";
  /** Saldo informado pela Nomad e quando (data do relatório, não do fim do período). */
  reportedBalance: { cents: number; date: string } | null;
  /** Quantos lançamentos cancelados foram deixados de fora. */
  cancelledCount: number;
};

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "1.218,20" → 121820. */
function brlStyleToCents(raw: string): number {
  return Math.round(Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) * 100);
}

/** "1 de setembro de 2026" → "2026-09-01". */
function longDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  return month ? iso(Number(m[3]), month, Number(m[1])) : null;
}

export function looksLikeNomad(text: string) {
  return (
    /Demonstrativo de transa[çc][õo]es da conta dep[óo]sito/i.test(text) &&
    /Community Federal Savings Bank/i.test(text)
  );
}

const STATUS = /^(Conclu[íi]do|Cancelado|Pendente|Em processamento)$/i;
const DATE_AMOUNT = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\d{2}:\d{2}\s+([+\-−])\s*US\$\s*([\d.]+,\d{2})$/;
const NOISE = [
  /^Cliente:/i,
  /^CPF:/i,
  /^Endere[çc]o:/i,
  /^Banco:/i,
  /^Electronic\/ACH/i,
  /^WIRE/i,
  /^N[úu]mero da conta/i,
  /^Demonstrativo de transa/i,
  /^Relat[óo]rio gerado/i,
  /^Saldo em/i,
  /^US\$\s/,
  /^Per[íi]odo$/i,
  /^Transa[çc][õo]es$/i,
  /^--\s*\d+ of \d+\s*--$/,
  /^\d+\s*\/\s*\d+$/,
  /^Este [ée] um relat[óo]rio/i,
  /^das transa[çc][õo]es realizadas/i,
  /^validade perante/i,
];

export function parseNomadStatementText(text: string): ParsedNomadStatement {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const periodLine = text.match(/(\d{1,2} de [a-zçã]+ de \d{4})\s+at[ée]\s+(\d{1,2} de [a-zçã]+ de \d{4})/i);
  const periodStart = periodLine ? longDate(periodLine[1]) : null;
  const periodEnd = periodLine ? longDate(periodLine[2]) : null;
  if (!periodStart || !periodEnd) {
    throw new StatementParseError("Não achei o período nesse demonstrativo da Nomad.");
  }

  const balance = text.match(/Saldo em (\d{1,2} de [a-zçã]+ de \d{4})[^\n]*\n\s*US\$\s*([\d.]+,\d{2})/i);
  const reportedBalance =
    balance && longDate(balance[1])
      ? { cents: brlStyleToCents(balance[2]), date: longDate(balance[1])! }
      : null;

  const transactions: ParsedTransaction[] = [];
  let cancelledCount = 0;
  let description: string | null = null;
  let status: string | null = null;

  for (const line of lines) {
    if (NOISE.some((re) => re.test(line))) continue;
    if (/^\d{1,2} de [a-zçã]+ de \d{4} at[ée]/i.test(line)) continue;

    if (STATUS.test(line)) {
      status = line;
      continue;
    }

    const m = line.match(DATE_AMOUNT);
    if (m) {
      if (description && status) {
        if (/^cancelado$/i.test(status)) {
          cancelledCount += 1;
        } else {
          transactions.push({
            date: iso(Number(m[3]), Number(m[2]), Number(m[1])),
            // "Compra PUBLIX #2022" → "PUBLIX #2022": o "Compra" é o tipo,
            // não o nome. Saque e depósito mantêm o texto.
            description: description.replace(/^Compra\s+/i, ""),
            amountCents: brlStyleToCents(m[5]),
            direction: m[4] === "+" ? "in" : "out",
            mcc: null,
          });
        }
      }
      description = null;
      status = null;
      continue;
    }

    // Qualquer outra linha é o começo de um lançamento.
    description = line;
    status = null;
  }

  if (transactions.length === 0 && cancelledCount === 0) {
    throw new StatementParseError("Não achei lançamentos nesse demonstrativo da Nomad.");
  }

  // Do mais antigo pro mais novo, como os outros extratos.
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return {
    kind: "nomad",
    periodStart,
    periodEnd,
    // Sem saldo de abertura e fechamento no documento: ficam zerados e a
    // conferência é marcada como "não dá pra conferir".
    beginningBalanceCents: 0,
    endingBalanceCents: reportedBalance?.cents ?? 0,
    transactions,
    dailyBalances: [],
    reportedBalance,
    cancelledCount,
  };
}
