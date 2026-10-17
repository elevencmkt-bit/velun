// Leitor de OFX / QFX (o arquivo "do Quicken/Money" que quase todo banco
// exporta). Roda no navegador.
//
// Duas versões no mundo:
// - OFX 1.x (SGML): os campos não fecham ("<TRNAMT>-12.50" e quebra de
//   linha); só os blocos fecham ("</STMTTRN>").
// - OFX 2.x (XML): tudo fecha.
// Lendo bloco por bloco e cada campo até o próximo "<" ou fim de linha,
// as duas saem do mesmo jeito.
//
// O sinal do valor é a regra: negativo sai, positivo entra — em conta e
// em cartão (no cartão, compra é negativa e pagamento é positivo).

import {
  FileReadError,
  isoFrom,
  periodOf,
  type FileStatement,
  type FileTransaction,
} from "./file-statement";

export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 4000);
  return /OFXHEADER|<\?OFX|<OFX>/i.test(head);
}

/** Valor de um campo dentro de um trecho ("<NAME>Publix" → "Publix"). */
function field(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  if (!m) return null;
  const v = decodeEntities(m[1]).trim();
  return v === "" ? null : v;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&");
}

function blocks(text: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** "20260815120000[-3:BRT]" → "2026-08-15". */
function ofxDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));
}

/**
 * "-1234.56", "1234,56", "-1.234,56", "+12" → centavos com sinal.
 * Banco brasileiro às vezes manda vírgula no OFX, contra a norma.
 */
export function ofxAmountCents(raw: string | null): number | null {
  if (!raw) return null;
  let s = raw.replace(/\s/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;
  // Os dois aparecem: o último é o decimal. Só um, uma vez: é o decimal.
  // Repetido ("1.234.567"): é milhar.
  let decimal: "." | "," | null = null;
  if (dots > 0 && commas > 0) decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1) decimal = ".";
  else if (commas === 1) decimal = ",";
  let intPart = s;
  let frac = "";
  if (decimal) {
    const at = s.lastIndexOf(decimal);
    intPart = s.slice(0, at);
    frac = s.slice(at + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || (intPart === "" && frac === "")) return null;
  // Arredonda pra centavos (alguns bancos mandam 3 ou 4 casas).
  const fracNum = Number(`0.${frac || "0"}`);
  const cents = Number(intPart || "0") * 100 + Math.round(fracNum * 100);
  return negative ? -cents : cents;
}

const DEBIT_TYPES = new Set([
  "DEBIT",
  "CHECK",
  "ATM",
  "POS",
  "FEE",
  "SRVCHG",
  "DIRECTDEBIT",
  "REPEATPMT",
  "CASH",
  "PAYMENT",
]);

/**
 * Nome do lançamento. Banco americano corta o NAME em 32 letras e põe o
 * resto no MEMO; banco brasileiro costuma deixar o NAME vazio e usar só o
 * MEMO. Junta os dois quando somam informação.
 */
function describe(name: string | null, memo: string | null, payee: string | null): string {
  const n = name ?? payee;
  if (!n) return memo ?? "";
  if (!memo) return n;
  const ln = n.toLowerCase();
  const lm = memo.toLowerCase();
  if (lm === ln || ln.includes(lm)) return n;
  if (lm.startsWith(ln) || lm.includes(ln)) return memo;
  return `${n} ${memo}`;
}

export function parseOfx(text: string): FileStatement {
  if (!looksLikeOfx(text)) {
    throw new FileReadError("Esse arquivo não parece um OFX. Baixe de novo no banco escolhendo OFX, QFX ou Quicken.");
  }

  const bankStatements = blocks(text, "STMTRS");
  const cardStatements = blocks(text, "CCSTMTRS");
  const all = [
    ...bankStatements.map((b) => ({ kind: "bank" as const, body: b })),
    ...cardStatements.map((b) => ({ kind: "card" as const, body: b })),
  ];
  const withTransactions = all.filter((s) => /<STMTTRN>/i.test(s.body));
  if (all.length === 0) {
    throw new FileReadError("Não achei lançamentos nesse OFX. Confira se ele foi baixado da conta ou do cartão certo.");
  }
  if (withTransactions.length > 1) {
    throw new FileReadError("Esse arquivo tem mais de uma conta junta. Baixe no banco o arquivo de uma conta por vez.");
  }
  const statement = withTransactions[0] ?? all[0];
  const body = statement.body;

  const raw = blocks(body, "STMTTRN").map((b) => ({
    type: (field(b, "TRNTYPE") ?? "").toUpperCase(),
    date: ofxDate(field(b, "DTPOSTED")) ?? ofxDate(field(b, "DTUSER")),
    cents: ofxAmountCents(field(b, "TRNAMT")),
    id: field(b, "FITID"),
    description: describe(field(b, "NAME"), field(b, "MEMO"), field(blocks(b, "PAYEE")[0] ?? "", "NAME")),
    sic: field(b, "SIC"),
    checkNum: field(b, "CHECKNUM"),
  }));

  // Alguns bancos mandam tudo positivo e dizem o sentido só no TRNTYPE.
  // Só nesse caso o tipo decide; quando há negativos, o sinal é a regra.
  const allPositive = raw.every((r) => r.cents === null || r.cents >= 0);
  const typeDecides = allPositive && raw.some((r) => DEBIT_TYPES.has(r.type) && r.type !== "PAYMENT");

  const seen = new Set<string>();
  const transactions: FileTransaction[] = [];
  let skipped = 0;
  for (const r of raw) {
    if (!r.date || r.cents === null || r.cents === 0) {
      skipped++;
      continue;
    }
    // O mesmo lançamento repetido no arquivo (mesmo FITID) entra uma vez.
    if (r.id) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
    }
    const out = typeDecides ? DEBIT_TYPES.has(r.type) : r.cents < 0;
    let description = r.description.replace(/\s+/g, " ").trim();
    if (!description) description = r.checkNum ? `Cheque ${r.checkNum}` : r.type || "Lançamento";
    transactions.push({
      date: r.date,
      description: description.slice(0, 200),
      amountCents: Math.abs(r.cents),
      direction: out ? "out" : "in",
      mcc: r.sic && /^\d{4}$/.test(r.sic) ? r.sic : null,
    });
  }

  if (transactions.length === 0) {
    throw new FileReadError("Esse OFX não tem lançamentos no período. Baixe de novo escolhendo um período maior.");
  }

  const tranList = blocks(body, "BANKTRANLIST")[0] ?? "";
  const { periodStart, periodEnd } = periodOf(
    transactions.map((t) => t.date),
    { start: ofxDate(field(tranList, "DTSTART")), end: null },
  );

  const ledger = blocks(body, "LEDGERBAL")[0];
  const balanceCents = ledger ? ofxAmountCents(field(ledger, "BALAMT")) : null;
  const balanceDate = ledger ? ofxDate(field(ledger, "DTASOF")) : null;

  return {
    format: "ofx",
    periodStart,
    periodEnd,
    kind: statement.kind,
    balance: balanceCents !== null && balanceDate ? { cents: balanceCents, date: balanceDate } : null,
    transactions,
    skipped,
  };
}
