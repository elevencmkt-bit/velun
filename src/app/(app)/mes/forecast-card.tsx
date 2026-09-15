import { Target } from "lucide-react";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ForecastRow({
  label,
  realizado,
  previsto,
  currency,
  barColor,
}: {
  label: string;
  realizado: number;
  previsto: number;
  currency: CurrencyCode;
  barColor: string;
}) {
  const pct = previsto > 0 ? Math.min(100, Math.round((realizado / previsto) * 100)) : realizado > 0 ? 100 : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-(--text-primary)">{label}</span>
        <span className="text-xs text-(--text-muted)">{pct}% do previsto já realizado</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-(--border-soft)">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-(--text-secondary)">
          Realizado: <strong className="font-semibold text-(--text-primary)">{formatCents(realizado, currency)}</strong>
        </span>
        <span className="text-(--text-muted)">Previsto: {formatCents(previsto, currency)}</span>
      </div>
    </div>
  );
}

export function ForecastCard({
  entradaRealizado,
  entradaPrevisto,
  saidaRealizado,
  saidaPrevisto,
  saldoRealizado,
  saldoPrevisto,
  currency,
}: {
  entradaRealizado: number;
  entradaPrevisto: number;
  saidaRealizado: number;
  saidaPrevisto: number;
  saldoRealizado: number;
  saldoPrevisto: number;
  currency: CurrencyCode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          <Target className="h-4 w-4" />
        </div>
        <div>
          <CardTitle className="text-card-title">Previsto x Realizado</CardTitle>
          <p className="text-xs text-(--text-muted)">O que já aconteceu neste mês vs. o que ainda está pendente.</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForecastRow
          label="Entradas"
          realizado={entradaRealizado}
          previsto={entradaPrevisto}
          currency={currency}
          barColor="var(--income)"
        />
        <ForecastRow
          label="Saídas"
          realizado={saidaRealizado}
          previsto={saidaPrevisto}
          currency={currency}
          barColor="var(--expense)"
        />
        <div className="flex items-center justify-between border-t border-(--border-soft) pt-3.5">
          <div className="flex flex-col">
            <span className="text-xs text-(--text-muted)">Já realizado</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: saldoRealizado < 0 ? "var(--expense)" : "var(--text-primary)" }}
            >
              {formatCents(saldoRealizado, currency)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-(--text-muted)">Saldo previsto do mês</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: saldoPrevisto < 0 ? "var(--expense)" : "var(--text-primary)" }}
            >
              {formatCents(saldoPrevisto, currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
