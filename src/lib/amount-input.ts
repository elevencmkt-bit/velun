// Valor digitado → "1234.56", do jeito que parseToCents entende.
//
// Quem fala português digita "85,15"; o servidor lê ponto. Sem isto,
// "85,15" virava 8515 dólares (a vírgula era simplesmente apagada).
// Regra: o ÚLTIMO separador ("," ou ".") seguido de 1 ou 2 dígitos é o
// decimal; os outros são de milhar.
export function normalizeAmount(raw: string): string {
  const s = raw.replace(/[^\d.,]/g, "");
  const m = s.match(/^(.*)[.,](\d{1,2})$/);
  if (m) return `${m[1].replace(/[.,]/g, "") || "0"}.${m[2]}`;
  return s.replace(/[.,]/g, "");
}

/** Centavos do valor digitado, ou 0 se não der pra ler. */
export function amountToCents(raw: string): number {
  const n = Number.parseFloat(normalizeAmount(raw));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
