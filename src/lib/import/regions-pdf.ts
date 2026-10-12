
// Parser do extrato mensal da Regions Bank (LifeGreen eAccess).
//
// Puro: entra texto, sai estrutura. Nenhuma dependência de PDF aqui.
//
// Três armadilhas do formato, todas tratadas aqui:
//
// 1. As linhas trazem só MM/DD. O ano vem do período no cabeçalho
//    ("June 23, 2026 through July 23, 2026"), e num extrato que cruza o
//    réveillon as duas metades têm anos diferentes.
// 2. Saldo negativo usa sinal DEPOIS do número ("173.76 -"), formato de
//    mainframe. Lido da esquerda pra direita vira positivo.
// 3. Os valores são todos positivos. Entrada ou saída depende da SEÇÃO
//    em que a linha está, e a seção atravessa páginas com "(CONTINUED)".

/**
 * Falha esperada de leitura (arquivo errado, PDF escaneado, formato de
 * outro banco). Quem chama devolve a mensagem pro usuário em vez de
 * deixar virar erro de servidor — o Next mascara exceção de server
 * action em produção, e o usuário acaba vendo um código do React.
 */
export class StatementParseError extends Error {
  readonly expected = true;
}

export type ParsedTransaction = {
  date: string; // ISO (YYYY-MM-DD)
  description: string;
  amountCents: number; // sempre positivo
  direction: "in" | "out";
  mcc: string | null; // código de categoria do cartão, quando presente
};

export type ParsedStatement = {
  periodStart: string;
  periodEnd: string;
  beginningBalanceCents: number;
  endingBalanceCents: number;
  transactions: ParsedTransaction[];
  dailyBalances: { date: string; balanceCents: number }[];
};

type Section = "deposits" | "withdrawals" | "fees" | "daily" | "other";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "1,234.56" -> 123456. O sinal pode vir solto depois do número, então
// quem chama passa a linha inteira em `trailing` quando for o caso.
function toCents(raw: string): number | null {
  const negative = /-\s*$/.test(raw);
  const match = raw.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const cents = Math.round(parseFloat(match[1]) * 100);
  return negative ? -cents : cents;
}

function parseLongDate(raw: string): { year: number; month: number; day: number } | null {
  const m = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return { year: Number(m[3]), month, day: Number(m[2]) };
}

// Resolve o ano de um MM/DD dentro do período do extrato. Um extrato de
// 23/dez a 23/jan tem 12/28 no ano inicial e 01/05 no ano seguinte.
function resolveYear(
  month: number,
  day: number,
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
): number {
  for (const year of [start.year, end.year]) {
    const value = iso(year, month, day);
    if (value >= iso(start.year, start.month, start.day) && value <= iso(end.year, end.month, end.day)) {
      return year;
    }
  }
  // Fora do período declarado (acontece: a data de postagem pode cair um
  // dia depois do fim do ciclo). Fica com o ano do início.
  return start.year;
}

function sectionFor(line: string): Section | null {
  const t = line.trim().toUpperCase();
  if (t.startsWith("DEPOSITS & CREDITS")) return "deposits";
  if (t.startsWith("WITHDRAWALS")) return "withdrawals";
  if (t.startsWith("FEES")) return "fees";
  if (t.startsWith("DAILY BALANCE SUMMARY")) return "daily";
  if (t.startsWith("SUMMARY") || t.startsWith("CHECKS")) return "other";
  return null;
}

// O código MCC aparece solto na descrição ("Doordash 5812 Doordash.Com
// CA 94107"). É um token de exatamente 4 dígitos que não é CEP nem o
// sufixo do cartão. Pega o primeiro, que na prática é o MCC.
function extractMcc(description: string): string | null {
  const tokens = description.split(/\s+/);
  for (const token of tokens) {
    if (/^\d{4}$/.test(token) && token !== "3145") return token;
  }
  return null;
}

/**
 * Converte o texto já extraído de um extrato da Regions em lançamentos.
 *
 * Recebe TEXTO, não bytes: a extração do PDF acontece no navegador
 * (src/lib/import/extract-pdf-text.ts). Dois motivos — o leitor de PDF
 * não sobrevive ao empacotamento serverless, e assim o arquivo nunca
 * sai da máquina de quem importa.
 */
export function parseRegionsStatementText(text: string): ParsedStatement {

  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());

  // --- período ---------------------------------------------------------
  let start: { year: number; month: number; day: number } | null = null;
  let end: { year: number; month: number; day: number } | null = null;
  for (const line of lines) {
    const m = line.trim().match(/^(.+?)\s+through\s+(.+)$/i);
    if (m) {
      const a = parseLongDate(m[1]);
      const b = parseLongDate(m[2]);
      if (a && b) {
        start = a;
        end = b;
        break;
      }
    }
  }
  if (!start || !end) {
    throw new StatementParseError(
      "Não encontrei o período do extrato neste PDF. Confira se é o extrato mensal da Regions.",
    );
  }

  // --- saldos do resumo -------------------------------------------------
  const summaryValue = (label: string): number | null => {
    const line = lines.find((l) => l.trim().toLowerCase().startsWith(label.toLowerCase()));
    if (!line) return null;
    return toCents(line.slice(label.length));
  };

  const beginningBalanceCents = summaryValue("Beginning Balance");
  const endingBalanceCents = summaryValue("Ending Balance");
  if (beginningBalanceCents === null || endingBalanceCents === null) {
    throw new StatementParseError(
      "Não encontrei o saldo inicial ou final no resumo deste extrato.",
    );
  }

  // --- lançamentos e saldos diários -------------------------------------
  const transactions: ParsedTransaction[] = [];
  const dailyBalances: { date: string; balanceCents: number }[] = [];
  let section: Section = "other";

  for (const line of lines) {
    const header = sectionFor(line);
    if (header) {
      section = header;
      continue;
    }

    const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const dateMatch = cells[0].match(/^(\d{2})\/(\d{2})$/);
    if (!dateMatch) continue;

    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);
    const date = iso(resolveYear(month, day, start, end), month, day);

    // O valor é a última célula; o sinal pode estar colado nela ou solto.
    const amountCell = cells[cells.length - 1];
    const amountCents = toCents(amountCell);
    if (amountCents === null) continue;

    if (section === "daily") {
      dailyBalances.push({ date, balanceCents: amountCents });
      continue;
    }

    if (section !== "deposits" && section !== "withdrawals" && section !== "fees") {
      continue;
    }

    const description = cells.slice(1, -1).join(" ").replace(/\s+/g, " ").trim();
    if (!description) continue;

    transactions.push({
      date,
      description,
      amountCents: Math.abs(amountCents),
      direction: section === "deposits" ? "in" : "out",
      mcc: extractMcc(description),
    });
  }

  if (transactions.length === 0) {
    throw new StatementParseError("Não encontrei nenhum lançamento neste PDF.");
  }

  return {
    periodStart: iso(start.year, start.month, start.day),
    periodEnd: iso(end.year, end.month, end.day),
    beginningBalanceCents,
    endingBalanceCents,
    transactions,
    dailyBalances,
  };
}
