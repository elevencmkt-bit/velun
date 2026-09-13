// Princípio 6 da spec: dinheiro é inteiro. Todo valor circula em
// amount_cents (BIGINT), nunca float. Estas são as únicas duas
// funções que cruzam a fronteira entre centavos e texto exibido.

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

export function parseToCents(input: string): number {
  const normalized = input.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Valor inválido: "${input}"`);
  }
  return Math.round(value * 100);
}
