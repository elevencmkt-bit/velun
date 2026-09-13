import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getAccountBalances } from "@/lib/balances";
import { formatCents } from "@/lib/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => {
              const balance = balances.get(account.id) ?? 0;
              return (
                <TableRow key={account.id} className={account.is_archived ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {account.name}
                    {account.is_archived ? (
                      <Badge variant="secondary" className="ml-2">
                        Arquivada
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</TableCell>
                  <TableCell>{account.institution ?? "—"}</TableCell>
                  <TableCell
                    className="text-right font-medium tabular-nums"
                    style={{ color: balance < 0 ? "var(--out)" : "var(--in)" }}
                  >
                    {formatCents(balance)}
                  </TableCell>
                  <TableCell>
                    <AccountRowActions accountId={account.id} isArchived={account.is_archived} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
