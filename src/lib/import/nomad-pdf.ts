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
//    antes de sair. Não mexeu no saldo, então fica de fora. Já
//    "Processando" (compra autorizada que ainda não fechou) a Nomad JÁ
//    desconta do saldo, então entra. Quando fechar, o próximo extrato
//    traz a mesma linha como "Concluído" e ela cai como duplicata.
//    Situação que não conhecemos não é jogada fora em silêncio: fica de
//    fora, mas contada, e a revisão avisa.
// 2. Valor no formato brasileiro ("US$ 1.218,20"), sinal na frente:
//    "+" entrou, "-" saiu.
// 3. O demonstrativo não traz saldo inicial nem final do período — só o
//    saldo NA HORA em que o relatório foi gerado, que pode ser semanas
//    depois do fim do período. Então não dá pra conferir o extrato contra
//    ele mesmo como na Regions; o saldo informado vai junto pra quem
//    revisa comparar com a conta depois.
// 4. Cabeçalho e rodapé (nome, CPF, número da conta, aviso legal) se
//    repetem em toda página e são ignorados — nada disso é guardado.
// 5. Na hora de exportar, dá pra escolher português ou INGLÊS. Em inglês
//    ("Deposit account statement"): situações "Settled"/"Canceled",
//    data no formato americano (mês/dia, "11/02/2026 - 8:50 AM"),
//    período "October, 3rd 2026 of November, 2nd 2026". O valor continua
//    no formato brasileiro ("US$ 1.217,56"), e o saldo pode ser negativo
//    ("US$ -3,38").

import { StatementParseError, type ParsedStatement, type ParsedTransaction } from "./regions-pdf";

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const MONTHS_EN: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export type ParsedNomadStatement = ParsedStatement & {
  kind: "nomad";
  /** Saldo informado pela Nomad e quando (data do relatório, não do fim do período). */
  reportedBalance: { cents: number; date: string } | null;
  /** Quantos lançamentos cancelados foram deixados de fora. */
  cancelledCount: number;
  /** Quantos ainda estão processando (entram, a Nomad já desconta). */
  processingCount: number;
  /** Situações desconhecidas que ficaram de fora, com quantos de cada. */
  unknownStatuses: Record<string, number>;
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

/** "October, 3rd 2026" / "November 02, 2026" → ISO. */
function longDateEn(text: string): string | null {
  const m = text.match(/([a-z]+),?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS_EN[m[1].toLowerCase()];
  return month ? iso(Number(m[3]), month, Number(m[2])) : null;
}

const PT_HEADER = /Demonstrativo de transa[çc][õo]es da conta dep[óo]sito/i;
const EN_HEADER = /Deposit account statement/i;

export function looksLikeNomad(text: string) {
  return (PT_HEADER.test(text) || EN_HEADER.test(text)) && /Community Federal Savings Bank/i.test(text);
}

const DONE = /^(Conclu[íi]do|Settled|Completed)$/i;
const PROCESSING = /^(Processando|Pendente|Em processamento|Processing|Pending)$/i;
const CANCELLED = /^(Cancelado|Canceled|Cancelled)$/i;
// Hora com AM/PM e de um dígito na versão em inglês ("8:50 AM").
const DATE_AMOUNT = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\d{1,2}:\d{2}(?:\s*[AP]M)?\s+([+\-−])\s*US\$\s*([\d.]+,\d{2})$/i;
const NOISE = [
  /^Client:/i,
  /^Address:/i,
  /^Bank:/i,
  /^Account number/i,
  /^Deposit account statement/i,
  /^Report generated/i,
  /^Balance on/i,
  /^Period of activity$/i,
  /^Transactions$/i,
  /^This is a transaction report/i,
  /^transactions carried out by you/i,
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
  /^US\$\s*-?\s*[\d.]+,\d{2}$/,
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

  const english = !PT_HEADER.test(text) && EN_HEADER.test(text);
  const readLong = english ? longDateEn : longDate;

  const periodLine = english
    ? text.match(/Period of activity\s*\n\s*([a-z]+,?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\s+(?:of|to|until|-)\s+([a-z]+,?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i)
    : text.match(/(\d{1,2} de [a-zçã]+ de \d{4})\s+at[ée]\s+(\d{1,2} de [a-zçã]+ de \d{4})/i);
  const periodStart = periodLine ? readLong(periodLine[1]) : null;
  const periodEnd = periodLine ? readLong(periodLine[2]) : null;
  if (!periodStart || !periodEnd) {
    throw new StatementParseError("Não achei o período nesse demonstrativo da Nomad.");
  }

  const balance = english
    ? text.match(/Balance on ([a-z]+ \d{1,2}, \d{4})[^\n]*\n\s*US\$\s*(-?)\s*([\d.]+,\d{2})/i)
    : text.match(/Saldo em (\d{1,2} de [a-zçã]+ de \d{4})[^\n]*\n\s*US\$\s*(-?)\s*([\d.]+,\d{2})/i);
  const balanceDate = balance ? readLong(balance[1]) : null;
  const reportedBalance =
    balance && balanceDate
      ? { cents: (balance[2] ? -1 : 1) * brlStyleToCents(balance[3]), date: balanceDate }
      : null;

  const transactions: ParsedTransaction[] = [];
  let cancelledCount = 0;
  let processingCount = 0;
  const unknownStatuses: Record<string, number> = {};
  // As linhas desde o último lançamento: a penúltima é o que foi, a
  // última é a situação.
  let pending: string[] = [];

  for (const line of lines) {
    if (NOISE.some((re) => re.test(line))) continue;
    if (/^\d{1,2} de [a-zçã]+ de \d{4} at[ée]/i.test(line)) continue;
    if (/^[a-z]+,?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\s+(?:of|to|until|-)\s/i.test(line)) continue;

    const m = line.match(DATE_AMOUNT);
    if (!m) {
      pending.push(line);
      continue;
    }

    const status = pending.at(-1) ?? null;
    const description = pending.length >= 2 ? pending.at(-2)! : null;
    pending = [];
    if (!status || !description) continue;

    if (CANCELLED.test(status)) {
      cancelledCount += 1;
      continue;
    }
    const isProcessing = PROCESSING.test(status);
    if (!isProcessing && !DONE.test(status)) {
      unknownStatuses[status] = (unknownStatuses[status] ?? 0) + 1;
      continue;
    }
    if (isProcessing) processingCount += 1;

    transactions.push({
      // Português: dia/mês. Inglês: mês/dia.
      date: english ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : iso(Number(m[3]), Number(m[2]), Number(m[1])),
      // Texto como veio ("Compra PUBLIX #2022"): a impressão digital
      // sai dele, e o nome limpo ("Publix") sai na limpeza, junto com
      // os outros bancos.
      description,
      amountCents: brlStyleToCents(m[5]),
      direction: m[4] === "+" ? "in" : "out",
      mcc: null,
    });
  }

  const unknownCount = Object.values(unknownStatuses).reduce((a, b) => a + b, 0);
  if (transactions.length === 0 && cancelledCount === 0 && unknownCount === 0) {
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
    processingCount,
    unknownStatuses,
  };
}
