// Extrato em tabela: CSV ou planilha do Excel (.xlsx). Roda no navegador.
//
// Cada banco monta a sua: colunas com nomes diferentes, data no formato
// do país, valor com sinal ou em duas colunas (débito e crédito), linhas
// de saldo no meio. Por isso a leitura tem duas partes:
// 1. adivinhar as colunas pelo nome do cabeçalho e pelos valores;
// 2. aplicar o mapeamento — que a pessoa confere na tela, e que fica
//    lembrado pra conta (a próxima planilha do mesmo banco entra direto).

import { unzipSync, strFromU8 } from "fflate";
import {
  FileReadError,
  isBalanceLine,
  isoFrom,
  periodOf,
  type FileFormat,
  type FileStatement,
  type FileTransaction,
} from "./file-statement";

export type DateFormat = "ymd" | "dmy" | "mdy";

export type ColumnMapping = {
  /** Linha do cabeçalho (-1: o arquivo não tem cabeçalho). */
  headerRow: number;
  date: number;
  description: number;
  /** Valor com sinal, numa coluna só. */
  amount: number | null;
  /** Ou: débito e crédito em colunas separadas. */
  debit: number | null;
  credit: number | null;
  dateFormat: DateFormat;
  decimal: "." | ",";
  /** Com valor numa coluna só: negativo é saída (true) ou positivo é saída. */
  outIsNegative: boolean;
};

export type Table = {
  format: Exclude<FileFormat, "ofx">;
  rows: string[][];
};

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** CSV com aspas, vírgula/ponto e vírgula/tab como separador. */
export function parseCsv(text: string): string[][] {
  const sample = text.split(/\r?\n/).slice(0, 30);
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => {
      const counts = sample.filter((l) => l.trim()).map((l) => splitLine(l, d).length);
      const many = counts.filter((c) => c > 1);
      // O separador certo divide quase todas as linhas no mesmo número.
      const mode = mostCommon(many);
      return { d, score: mode ? many.filter((c) => c === mode).length * Math.min(mode, 8) : 0 };
    })
    .sort((a, b) => b.score - a.score)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return clean(rows);
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === d && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n || (c === n && best !== null && v > best)) [best, n] = [v, c];
  return best;
}

/** Tira linhas vazias e espaços nas pontas. */
function clean(rows: string[][]): string[][] {
  return rows
    .map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()))
    .filter((r) => r.some((c) => c !== ""));
}

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** "AB12" → coluna 27 (a partir de 0). */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Primeira aba de um .xlsx. O .xlsx é um zip de XMLs; dá pra ler sem
 * biblioteca de planilha: textos compartilhados + a aba.
 *
 * Número sai como texto com ponto ("-12.5" vira "-12.50"), e data do
 * Excel sai como o número de série dela — `parseDate` reconhece.
 */
export function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === "xl/workbook.xml" ||
        f.name === "xl/_rels/workbook.xml.rels" ||
        f.name === "xl/sharedStrings.xml" ||
        f.name.startsWith("xl/worksheets/sheet"),
    });
  } catch {
    throw new FileReadError("Não consegui abrir essa planilha. Salve de novo como .xlsx ou .csv e tente outra vez.");
  }

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const xml = strFromU8(files["xl/sharedStrings.xml"]);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1]));
      shared.push(parts.join(""));
    }
  }

  // A primeira aba na ordem do arquivo (não necessariamente sheet1.xml).
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const firstSheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (firstSheet) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstSheet}"[^>]*Target="([^"]+)"`).exec(rels)
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet}"`).exec(rels);
    if (rel) sheetPath = rel[1].startsWith("/") ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, "")}`;
  }
  const sheet = files[sheetPath] ?? Object.entries(files).find(([k]) => k.startsWith("xl/worksheets/sheet"))?.[1];
  if (!sheet) throw new FileReadError("Essa planilha não tem nenhuma aba com dados.");

  const xml = strFromU8(sheet);
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : row.length;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) {
        value = xmlText(v);
        // Número: arredonda o ruído do ponto flutuante (12.300000000000001).
        if (type !== "str" && /^-?\d+(\.\d+)?(E-?\d+)?$/i.test(value)) {
          const n = Number(value);
          value = Number.isInteger(n) ? String(n) : n.toFixed(2);
        }
      }
      while (row.length < col) row.push("");
      row[col] = value;
    }
    rows.push(row);
  }
  return clean(rows);
}

// ---------------------------------------------------------------------------
// Datas e valores
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, sept: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

function year(y: string): number {
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

/** Data de uma célula, no formato escolhido. null se não for data. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i, "").replace(/T.*$/, "");
  if (!s) return null;

  // Número de série do Excel (dias desde 30/12/1899).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < 30000 || serial > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return isoFrom(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (format === "mdy") return isoFrom(year(m[3]), a, b);
    return isoFrom(year(m[3]), b, a);
  }

  // "15 ago 2026", "15-Aug-26", "Aug 15, 2026"
  m = /^(\d{1,2})[\s\-/.]+(?:de\s+)?([a-zç]{3,})\.?[\s\-/.]+(?:de\s+)?(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()] ?? MONTHS[m[2].slice(0, 4).toLowerCase()];
    return month ? isoFrom(year(m[3]), month, Number(m[1])) : null;
  }
  m = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return month ? isoFrom(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/**
 * Valor de uma célula em centavos, com sinal. Aceita "R$ 1.234,56",
 * "-$12.50", "(12.50)", "12,50-", "123,45 D" (débito) e "123,45 C".
 */
export function parseAmount(raw: string, decimal: "." | ","): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const dc = /\s*\b([DC])$/i.exec(s);
  if (dc) {
    if (dc[1].toUpperCase() === "D") negative = true;
    s = s.slice(0, dc.index);
  }
  if (/-$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/(R\$|US\$|U\$|\$|€|£|BRL|USD|EUR)/gi, "").replace(/\s/g, "");
  s = s.replace(/^[−–]/, "-");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const thousands = decimal === "." ? "," : ".";
  s = s.split(thousands).join("");
  if (decimal === ",") s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

// ---------------------------------------------------------------------------
// Adivinhar as colunas
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DATE_WORDS = /^(data|date|dt|dia|posted|posting date|post date|transaction date|trans date|data (do )?lancamento|data (da )?(compra|transacao|movimento|operacao)|data mov|fecha)\b/;
// Em ordem de preferência: "Details" do Chase é DEBIT/CREDIT, não o nome.
const DESC_WORDS = [
  /\b(descricao|description|historico|lancamento)\b/,
  /\b(payee|estabelecimento|merchant|title|titulo)\b/,
  /\b(memo|name|nome|transacao|transaction|detalhes?|details?)\b/,
];
const AMOUNT_WORDS = /^(valor|amount|montante|quantia|value|valor rs|valor r|valor us|valor brl|valor usd|transaction amount|amount usd|amount brl)\b/;
const DEBIT_WORDS = /\b(debito|debit|debits|saida|saidas|withdrawal|withdrawals|outflow|valor debito)\b/;
const CREDIT_WORDS = /\b(credito|credit|credits|entrada|entradas|deposit|deposits|inflow|valor credito)\b/;
const SKIP_DESC = /\b(saldo|balance|categoria|category|tipo|type|status|moeda|currency|conta|account|documento|doc|parcela)\b/;

/** Linha do cabeçalho: a primeira que tem nome de data e de valor. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(norm);
    const hasDate = cells.some((c) => DATE_WORDS.test(c));
    const hasValue = cells.some((c) => AMOUNT_WORDS.test(c) || DEBIT_WORDS.test(c) || CREDIT_WORDS.test(c));
    if (hasDate && hasValue) return i;
  }
  return -1;
}

/** Chave do formato do arquivo: os nomes do cabeçalho (ou só o nº de colunas). */
export function tableSignature(rows: string[][], headerRow: number): string {
  if (headerRow < 0) return `cols:${Math.max(...rows.slice(0, 10).map((r) => r.length))}`;
  return rows[headerRow].map(norm).join("|").slice(0, 400);
}

function dataRows(rows: string[][], headerRow: number): string[][] {
  return rows.slice(headerRow + 1);
}

function detectDateFormat(values: string[], currency: string): DateFormat {
  let firstOver12 = 0;
  let secondOver12 = 0;
  let iso = 0;
  for (const v of values) {
    const s = v.trim();
    if (/^\d{4}[-/.]/.test(s)) iso++;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]/.exec(s);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12++;
    if (Number(m[2]) > 12) secondOver12++;
  }
  if (iso > 0 && firstOver12 === 0 && secondOver12 === 0) return "ymd";
  if (firstOver12 > 0 && secondOver12 === 0) return "dmy";
  if (secondOver12 > 0 && firstOver12 === 0) return "mdy";
  return currency === "USD" ? "mdy" : "dmy";
}

function detectDecimal(values: string[], currency: string): "." | "," {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    if (/,\d{1,2}(\s*[DC-])?\)?$/i.test(v.trim())) comma++;
    else if (/\.\d{1,2}(\s*[DC-])?\)?$/i.test(v.trim())) dot++;
  }
  if (comma > dot) return ",";
  if (dot > comma) return ".";
  return currency === "BRL" ? "," : ".";
}

function isDateColumn(values: string[]): boolean {
  const filled = values.filter(Boolean);
  if (filled.length === 0) return false;
  const ok = filled.filter((v) => parseDate(v, "dmy") || parseDate(v, "mdy")).length;
  return ok / filled.length > 0.6;
}

function isNumberColumn(values: string[]): boolean {
  const filled = values.filter(Boolean);
  if (filled.length === 0) return false;
  const ok = filled.filter((v) => parseAmount(v, ".") !== null || parseAmount(v, ",") !== null).length;
  return ok / filled.length > 0.8;
}

/**
 * Primeiro palpite de mapeamento: pelo nome das colunas e, sem
 * cabeçalho, pelo jeito dos valores. `isCard` muda o palpite do sinal
 * (fatura costuma listar compra como positivo).
 */
export function guessMapping(rows: string[][], opts: { currency: string; isCard: boolean }): ColumnMapping {
  const headerRow = findHeaderRow(rows);
  const body = dataRows(rows, headerRow).slice(0, 200);
  const width = Math.max(0, ...rows.slice(Math.max(0, headerRow), headerRow + 50).map((r) => r.length));
  const col = (i: number) => body.map((r) => r[i] ?? "");
  const header = headerRow >= 0 ? rows[headerRow].map(norm) : [];

  const pick = (re: RegExp, also?: (i: number) => boolean) => {
    for (let i = 0; i < width; i++) if (re.test(header[i] ?? "") && (!also || also(i))) return i;
    return -1;
  };

  let date = pick(DATE_WORDS, (i) => isDateColumn(col(i)));
  if (date < 0) date = [...Array(width).keys()].find((i) => isDateColumn(col(i))) ?? 0;

  let amount: number | null = pick(AMOUNT_WORDS, (i) => i !== date);
  let debit: number | null = pick(DEBIT_WORDS, (i) => i !== date);
  let credit: number | null = pick(CREDIT_WORDS, (i) => i !== date && i !== debit);
  if (amount >= 0) {
    debit = null;
    credit = null;
  } else {
    amount = null;
    if (debit < 0 || credit < 0) {
      debit = null;
      credit = null;
      // Sem nome que ajude: a última coluna numérica que não é saldo.
      const numeric = [...Array(width).keys()].filter(
        (i) => i !== date && isNumberColumn(col(i)) && !/saldo|balance/.test(header[i] ?? ""),
      );
      amount = numeric[0] ?? Math.min(width - 1, date + 2);
    }
  }

  const taken = new Set([date, amount, debit, credit].filter((x): x is number => x !== null));
  let description = -1;
  for (const re of DESC_WORDS) {
    description = pick(re, (i) => !taken.has(i) && !SKIP_DESC.test(header[i] ?? ""));
    if (description >= 0) break;
  }
  if (description < 0) {
    // A coluna com mais texto.
    let best = -1;
    let bestLen = -1;
    for (let i = 0; i < width; i++) {
      if (taken.has(i)) continue;
      const len = col(i).reduce((n, v) => n + (/[a-z]/i.test(v) ? v.length : 0), 0);
      if (len > bestLen) [best, bestLen] = [i, len];
    }
    description = best < 0 ? 0 : best;
  }

  const valueCells = [amount, debit, credit].filter((x): x is number => x !== null).flatMap((i) => col(i));
  const decimal = detectDecimal(valueCells, opts.currency);
  const dateFormat = detectDateFormat(col(date), opts.currency);

  // Sinal: na conta, negativo é saída. Na fatura, se quase tudo é
  // positivo, positivo é compra (saída).
  let outIsNegative = true;
  if (amount !== null && opts.isCard) {
    const values = col(amount).map((v) => parseAmount(v, decimal)).filter((n): n is number => n !== null && n !== 0);
    const positives = values.filter((n) => n > 0).length;
    if (values.length > 0 && positives / values.length > 0.6) outIsNegative = false;
  }

  return { headerRow, date, description, amount, debit, credit, dateFormat, decimal, outIsNegative };
}

/** Nomes das colunas pra escolher na tela ("Data", ou "Coluna C"). */
export function columnLabels(rows: string[][], headerRow: number): string[] {
  const width = Math.max(0, ...rows.slice(Math.max(0, headerRow), headerRow + 50).map((r) => r.length));
  return [...Array(width).keys()].map((i) => {
    const name = headerRow >= 0 ? rows[headerRow][i]?.trim() : "";
    return name || `Coluna ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
  });
}

/** O mapeamento serve pra essa tabela (colunas existem)? */
export function mappingFits(rows: string[][], m: ColumnMapping): boolean {
  if (m.headerRow >= rows.length) return false;
  const width = Math.max(0, ...rows.slice(Math.max(0, m.headerRow), m.headerRow + 50).map((r) => r.length));
  const cols = [m.date, m.description, m.amount, m.debit, m.credit].filter((x): x is number => x !== null);
  if (m.amount === null && (m.debit === null || m.credit === null)) return false;
  return cols.every((c) => Number.isInteger(c) && c >= 0 && c < width);
}

// ---------------------------------------------------------------------------
// Aplicar
// ---------------------------------------------------------------------------

export function applyMapping(table: Table, m: ColumnMapping): FileStatement {
  const transactions: FileTransaction[] = [];
  let skipped = 0;
  for (const r of dataRows(table.rows, m.headerRow)) {
    const date = parseDate(r[m.date] ?? "", m.dateFormat);
    const description = (r[m.description] ?? "").replace(/\s+/g, " ").trim();
    let cents: number | null = null;
    if (m.amount !== null) {
      const v = parseAmount(r[m.amount] ?? "", m.decimal);
      cents = v === null ? null : m.outIsNegative ? v : -v;
    } else {
      const d = parseAmount(r[m.debit ?? -1] ?? "", m.decimal);
      const c = parseAmount(r[m.credit ?? -1] ?? "", m.decimal);
      if (d) cents = -Math.abs(d);
      else if (c) cents = Math.abs(c);
    }
    if (!date || cents === null || cents === 0 || isBalanceLine(description)) {
      skipped++;
      continue;
    }
    transactions.push({
      date,
      description: (description || "Lançamento").slice(0, 200),
      amountCents: Math.abs(cents),
      direction: cents < 0 ? "out" : "in",
      mcc: null,
    });
  }
  if (transactions.length === 0) {
    return { format: table.format, periodStart: "", periodEnd: "", kind: null, balance: null, transactions, skipped };
  }
  const { periodStart, periodEnd } = periodOf(transactions.map((t) => t.date));
  return { format: table.format, periodStart, periodEnd, kind: null, balance: null, transactions, skipped };
}

/** Lê o arquivo (CSV ou .xlsx) em linhas. */
export function readTable(name: string, bytes: Uint8Array, decode: (b: Uint8Array) => string): Table {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const rows = readXlsx(bytes);
    if (rows.length === 0) throw new FileReadError("Essa planilha está vazia.");
    return { format: "xlsx", rows };
  }
  const rows = parseCsv(decode(bytes));
  if (rows.length === 0) throw new FileReadError("Esse arquivo está vazio.");
  return { format: "csv", rows };
}
