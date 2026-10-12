import { formatCents, type CurrencyCode } from "@/lib/money";

/**
 * Valor em dinheiro na tela. A classe `money` é o que o "ocultar
 * valores" (o olho no topo) borra — todo valor exibido passa por aqui
 * ou leva a classe à mão.
 */
export function Money({
  cents,
  currency,
  className,
}: {
  cents: number;
  currency: CurrencyCode;
  className?: string;
}) {
  return <span className={className ? `money ${className}` : "money"}>{formatCents(cents, currency)}</span>;
}
