import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getAccountBalances } from "@/lib/balances";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { CashFlowChart, type CashFlowPoint } from "./cash-flow-chart";

const HORIZON_DAYS = 90;

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export default async function FluxoDeCaixaPage() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const today = new Date(new Date().toDateString());
  const horizon = addDays(today, HORIZON_DAYS);

  const [balances, { data: pending }] = await Promise.all([
    getAccountBalances(supabase, householdId),
    supabase
      .from("transactions")
      .select("date, amount_cents, direction")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .gte("date", toISO(today))
      .lte("date", toISO(horizon)),
  ]);

  const currentTotal = Array.from(balances.values()).reduce((sum, v) => sum + v, 0);

  const deltaByDate = new Map<string, number>();
  for (const row of pending ?? []) {
    const delta = row.direction === "in" ? row.amount_cents : -row.amount_cents;
    deltaByDate.set(row.date, (deltaByDate.get(row.date) ?? 0) + delta);
  }

  const points: CashFlowPoint[] = [];
  let running = currentTotal;
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const d = addDays(today, i);
    const iso = toISO(d);
    running += deltaByDate.get(iso) ?? 0;
    points.push({
      date: iso,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      balance_cents: running,
    });
  }

  const lowestPoint = points.reduce((min, p) => (p.balance_cents < min.balance_cents ? p : min));
  const finalPoint = points[points.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-medium">Fluxo de caixa</h1>
      <p className="text-sm text-[--ink]/70">
        Saldo atual mais as contas pendentes, projetado para os próximos {HORIZON_DAYS} dias.
      </p>

      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--badge-blue-bg)" }}
            >
              <Wallet className="h-5 w-5" style={{ color: "var(--badge-blue-fg)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[--ink]/60">Saldo atual</span>
              <span className="text-xl font-semibold tabular-nums">
                {formatCents(currentTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor:
                  finalPoint.balance_cents < 0 ? "var(--badge-red-bg)" : "var(--badge-green-bg)",
              }}
            >
              <TrendingUp
                className="h-5 w-5"
                style={{
                  color:
                    finalPoint.balance_cents < 0
                      ? "var(--badge-red-fg)"
                      : "var(--badge-green-fg)",
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[--ink]/60">Projetado em {HORIZON_DAYS} dias</span>
              <span
                className="text-xl font-semibold tabular-nums"
                style={{ color: finalPoint.balance_cents < 0 ? "var(--out)" : "var(--in)" }}
              >
                {formatCents(finalPoint.balance_cents)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--badge-purple-bg)" }}
            >
              <TrendingDown className="h-5 w-5" style={{ color: "var(--badge-purple-fg)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[--ink]/60">Ponto mais baixo</span>
              <span
                className="text-xl font-semibold tabular-nums"
                style={{ color: lowestPoint.balance_cents < 0 ? "var(--out)" : "var(--ink)" }}
              >
                {formatCents(lowestPoint.balance_cents)}
              </span>
              <span className="text-xs text-[--ink]/50">em {lowestPoint.label}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <CashFlowChart points={points} />
        </CardContent>
      </Card>
    </div>
  );
}
