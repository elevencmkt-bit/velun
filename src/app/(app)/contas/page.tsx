import { Banknote, CreditCard, LineChart, PiggyBank, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getAccountBalances } from "@/lib/balances";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "./account-form";
import { AccountRowActions } from "./account-row-actions";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro vivo",
  investment: "Investimento",
};

const ACCOUNT_TYPE_ICONS: Record<string, typeof Wallet> = {
  checking: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Banknote,
  investment: LineChart,
};

export default async function ContasPage() {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const [{ data: accounts }, balances] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, institution, is_archived")
      .eq("household_id", householdId)
      .order("sort_order")
      .order("name"),
    getAccountBalances(supabase, householdId),
  ]);

  const activeAccounts = (accounts ?? []).filter((a) => !a.is_archived);
  const total = activeAccounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Contas</h1>
        <AccountForm />
      </div>

      {!accounts || accounts.length === 0 ? (
        <p className="text-sm text-[--ink]/70">
          Nenhuma conta ainda. Crie a primeira para começar a lançar transações.
        </p>
      ) : (
        <>
          <Card className="w-fit shadow-sm">
            <CardContent className="flex items-center gap-3 pt-6">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--badge-blue-bg)" }}
              >
                <Wallet className="h-5 w-5" style={{ color: "var(--badge-blue-fg)" }} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-[--ink]/60">Saldo total</span>
                <span className="text-xl font-semibold tabular-nums">{formatCents(total)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            {accounts.map((account) => {
              const balance = balances.get(account.id) ?? 0;
              const Icon = ACCOUNT_TYPE_ICONS[account.type] ?? Wallet;
              return (
                <Card
                  key={account.id}
                  className={`shadow-sm ${account.is_archived ? "opacity-50" : ""}`}
                >
                  <CardContent className="flex flex-col gap-3 pt-6">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "var(--badge-purple-bg)" }}
                      >
                        <Icon className="h-5 w-5" style={{ color: "var(--badge-purple-fg)" }} />
                      </div>
                      {account.is_archived ? (
                        <Badge variant="secondary">Arquivada</Badge>
                      ) : (
                        <AccountRowActions accountId={account.id} isArchived={false} />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{account.name}</div>
                      <div className="text-xs text-[--ink]/50">
                        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        {account.institution ? ` · ${account.institution}` : ""}
                      </div>
                    </div>
                    <span
                      className="text-xl font-semibold tabular-nums"
                      style={{ color: balance < 0 ? "var(--out)" : "var(--in)" }}
                    >
                      {formatCents(balance)}
                    </span>
                    {account.is_archived ? (
                      <AccountRowActions accountId={account.id} isArchived />
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
