import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getCashFlowProjection } from "@/lib/cash-flow";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { CashFlowChart } from "./cash-flow-chart";

const HORIZON_DAYS = 90;

export default async function FluxoDeCaixaPage() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { points, currentTotal, lowestPoint, finalPoint } = await getCashFlowProjection(
    supabase,
    householdId,
    HORIZON_DAYS,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title">Fluxo de caixa</h1>
        <p className="text-page-subtitle">
          Saldo atual mais as contas pendentes, projetado para os próximos {HORIZON_DAYS} dias.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex min-h-[116px] items-center gap-4">
            <div
              className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[10px]"
              style={{ backgroundColor: "var(--badge-blue-bg)" }}
            >
              <Wallet className="h-6 w-6" style={{ color: "var(--badge-blue-fg)" }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-kpi-label">Saldo atual</span>
              <span className="text-kpi-value">{formatCents(currentTotal)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[116px] items-center gap-4">
            <div
              className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[10px]"
              style={{
                backgroundColor:
                  finalPoint.balance_cents < 0 ? "var(--badge-red-bg)" : "var(--badge-green-bg)",
              }}
            >
              <TrendingUp
                className="h-6 w-6"
                style={{
                  color:
                    finalPoint.balance_cents < 0
                      ? "var(--badge-red-fg)"
                      : "var(--badge-green-fg)",
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-kpi-label">Projetado em {HORIZON_DAYS} dias</span>
              <span
                className="text-kpi-value"
                style={{ color: finalPoint.balance_cents < 0 ? "var(--expense)" : undefined }}
              >
                {formatCents(finalPoint.balance_cents)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[116px] items-center gap-4">
            <div
              className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[10px]"
              style={{ backgroundColor: "var(--badge-purple-bg)" }}
            >
              <TrendingDown className="h-6 w-6" style={{ color: "var(--badge-purple-fg)" }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-kpi-label">Ponto mais baixo</span>
              <span
                className="text-kpi-value"
                style={{ color: lowestPoint.balance_cents < 0 ? "var(--expense)" : undefined }}
              >
                {formatCents(lowestPoint.balance_cents)}
              </span>
              <span className="text-xs text-(--text-muted)">em {lowestPoint.label}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CashFlowChart points={points} />
        </CardContent>
      </Card>
    </div>
  );
}
