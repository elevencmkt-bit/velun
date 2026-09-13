// Princípio 6 da spec: dinheiro é inteiro. Todo valor circula em
// amount_cents (BIGINT), nunca float. Estas são as únicas duas
// funções que cruzam a fronteira entre centavos e texto exibido.

export type CurrencyCode = "BRL" | "USD" | "EUR";

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  BRL: "Real (R$)",
  USD: "Dólar (US$)",
  EUR: "Euro (€)",
};

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

// Um Intl.NumberFormat por moeda, reaproveitado entre chamadas — são
// objetos imutáveis (sem estado por household), seguro reusar em
// requests concorrentes de households diferentes.
const formatters = new Map<CurrencyCode, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode) {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
      style: "currency",
      currency,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

export function formatCents(cents: number, currency: CurrencyCode = "USD"): string {
  return getFormatter(currency).format(cents / 100);
}

export function parseToCents(input: string): number {
  const normalized = input.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Valor inválido: "${input}"`);
  }
  return Math.round(value * 100);
}
