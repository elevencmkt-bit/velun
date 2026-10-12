import { Lock, Wallet } from "lucide-react";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getAccountBalances } from "@/lib/balances";
import { accountScope } from "@/lib/visibility";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "./account-form";
import { AccountRowActions } from "./account-row-actions";
import { Money } from "@/components/money";

// Texto curto pro badge da conta pessoal do outro membro. Diz o que ele
// escolheu mostrar, sem revelar nada além disso.
const VISIBILITY_BADGE: Record<string, string> = {
  balance_only: "Só o saldo",
  categories_only: "Sem lançamentos",
  shared: "Aberta",
};

export default async function ContasPage() {
  const { householdId, memberId, currency } = await getCurrentMember();
  const supabase = await createClient();

  const [{ data: accounts }, balances, { data: members }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, institution, is_archived, opening_balance_cents, owner_id, visibility")
      .eq("household_id", householdId)
      .order("sort_order")
      .order("name"),
    accountScope(supabase, householdId, memberId, "balance").then((scope) =>
      getAccountBalances(supabase, householdId, scope),
    ),
    supabase.from("members").select("id, display_name").eq("household_id", householdId),
  ]);

  const memberNames = new Map(
    (members ?? []).map((m) => [m.id as string, m.display_name as string]),
  );

  const activeAccounts = (accounts ?? []).filter((a) => !a.is_archived);
  const total = activeAccounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-page-title">Contas</h1>
          <p className="text-page-subtitle">Saldo de cada conta, a partir dos lançamentos confirmados.</p>
        </div>
        <AccountForm />
      </div>

      {!accounts || accounts.length === 0 ? (
        <p className="text-sm text-(--text-muted)">
          Nenhuma conta ainda. Crie a primeira para começar a lançar transações.
        </p>
      ) : (
        <>
          <Card className="sm:w-fit">
            <CardContent className="flex items-center gap-4 sm:min-h-[128px] sm:gap-5">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16"
                style={{ backgroundColor: "var(--badge-blue-bg)" }}
              >
                <Wallet className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: "var(--badge-blue-fg)" }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-kpi-label">Saldo total</span>
                <span className="text-kpi-value"><Money cents={total} currency={currency} /></span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {accounts.map((account) => {
              const balance = balances.get(account.id) ?? 0;
              const Icon = ACCOUNT_TYPE_ICONS[account.type] ?? Wallet;
              // Conta do casal ou minha: posso editar e arquivar. Conta
              // pessoal do outro: só olho o que ele escolheu mostrar.
              const isPersonal = account.owner_id !== null;
              const isMine = account.owner_id === memberId;
              const canManage = !isPersonal || isMine;
              const ownerName = isPersonal
                ? (memberNames.get(account.owner_id as string) ?? "membro")
                : null;
              return (
                <Card
                  key={account.id}
                  className={account.is_archived ? "opacity-50" : ""}
                >
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-16 sm:w-16 sm:rounded-2xl"
                        style={{ backgroundColor: "var(--badge-purple-bg)" }}
                      >
                        <Icon className="h-5 w-5 sm:h-8 sm:w-8" style={{ color: "var(--badge-purple-fg)" }} />
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-1">
                          <AccountForm
                            account={{
                              id: account.id,
                              name: account.name,
                              type: account.type,
                              institution: account.institution,
                              opening_balance_cents: account.opening_balance_cents,
                              owner_id: account.owner_id,
                              visibility: account.visibility,
                            }}
                          />
                          <AccountRowActions accountId={account.id} isArchived={account.is_archived} />
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {isPersonal ? (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-(--text-muted)"
                            aria-label="Conta pessoal"
                          />
                        ) : null}
                        <span className="text-card-title">{account.name}</span>
                        {account.is_archived ? (
                          <Badge variant="secondary">Arquivada</Badge>
                        ) : null}
                        {isPersonal && !isMine ? (
                          <Badge variant="secondary">
                            {VISIBILITY_BADGE[account.visibility] ?? "Pessoal"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-(--text-muted)">
                        {isPersonal ? (isMine ? "Minha · " : `${ownerName} · `) : ""}
                        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        {account.institution ? ` · ${account.institution}` : ""}
                      </div>
                    </div>
                    <span
                      className="text-kpi-value"
                      style={{ color: balance < 0 ? "var(--expense)" : undefined }}
                    >
                      <Money cents={balance} currency={currency} />
                    </span>
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
