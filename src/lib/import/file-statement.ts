// Extrato que chega como ARQUIVO de dados (OFX/QFX, CSV, planilha).
//
// Diferente do PDF e do print, aqui não há texto pra interpretar no
// servidor: o arquivo já traz cada lançamento em campos. A leitura toda
// acontece no navegador (o arquivo não sai da máquina) e pro servidor vai
// só a lista de lançamentos, neste formato.

export type FileFormat = "ofx" | "csv" | "xlsx";

export type FileTransaction = {
  /** AAAA-MM-DD */
  date: string;
  description: string;
  /** Sempre positivo; o sentido vai em `direction`. */
  amountCents: number;
  direction: "in" | "out";
  /** Código do tipo de estabelecimento (SIC/MCC), quando o OFX traz. */
  mcc: string | null;
};

export type FileStatement = {
  format: FileFormat;
  periodStart: string;
  periodEnd: string;
  /** "card": o arquivo diz que é cartão; "bank": conta; null: não diz (CSV). */
  kind: "bank" | "card" | null;
  /** Saldo que o banco informa no arquivo (OFX LEDGERBAL), quando tem. */
  balance: { cents: number; date: string } | null;
  transactions: FileTransaction[];
  /** Linhas que ficaram de fora (saldo do dia, total, sem data ou valor). */
  skipped: number;
};

/** Erro de leitura com frase pronta pra quem está importando. */
export class FileReadError extends Error {}

/**
 * Texto do arquivo. Banco brasileiro ainda manda OFX e CSV em
 * Windows-1252 (o "ç" vira "Ã§" se lido como UTF-8): tenta UTF-8 estrito
 * e, se não for, lê como 1252.
 */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    text = new TextDecoder("windows-1252").decode(view);
  }
  return text.replace(/^﻿/, "");
}

/** Data ISO válida (o dia existe no calendário). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1990 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isoFrom(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** Período coberto: o informado, esticado pra conter todas as datas. */
export function periodOf(
  dates: string[],
  declared?: { start?: string | null; end?: string | null },
): { periodStart: string; periodEnd: string } {
  const sorted = [...dates].sort();
  let start = sorted[0];
  let end = sorted[sorted.length - 1];
  if (declared?.start && isIsoDate(declared.start) && declared.start < start) start = declared.start;
  if (declared?.end && isIsoDate(declared.end) && declared.end > end) end = declared.end;
  return { periodStart: start, periodEnd: end };
}

/** Linhas que são saldo ou total, não lançamento. */
export function isBalanceLine(description: string): boolean {
  return /^\s*(saldo|s\s*a\s*l\s*d\s*o|total|subtotal|balance|beginning balance|ending balance|opening balance|closing balance|saldo anterior|saldo do dia|saldo final)\b/i.test(
    description,
  );
}
