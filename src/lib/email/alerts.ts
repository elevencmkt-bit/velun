import { addDaysISO } from "@/lib/today";
import type { CashAccount, UpcomingItem } from "./upcoming";
import { OVERDUE_WINDOW_DAYS } from "./week";

// Aviso de vencimento, sem banco. Só sai e-mail num dia em que:
// - alguma saída vence amanhã, ou
// - algum lançamento ficou atrasado ontem (venceu ontem e não foi marcado).
// Quando sai, mostra também todas as atrasadas recentes, separadas por
// conta, com o saldo de hoje e se dá pra pagar.

export type AlertItem = UpcomingItem & { status: "tomorrow" | "overdue" };

export type AlertGroup = {
  accountId: string | null;
  name: string;
  /** Saldo hoje (null: fatura de cartão sem conta que paga). */
  balanceCents: number | null;
  items: AlertItem[];
  /** Saldo depois de pagar as saídas listadas. */
  afterCents: number | null;
};

export type AlertSummary = {
  tomorrow: string;
  dueTomorrow: AlertItem[];
  overdue: AlertItem[];
  groups: AlertGroup[];
};

export function buildAlerts(input: { today: string; accounts: CashAccount[]; items: UpcomingItem[] }): AlertSummary | null {
  const { today, accounts, items } = input;
  const tomorrow = addDaysISO(today, 1);
  const yesterday = addDaysISO(today, -1);
  const oldest = addDaysISO(today, -OVERDUE_WINDOW_DAYS);
  const listed = items.filter((i) => !i.silent);

  const dueTomorrow: AlertItem[] = listed
    .filter((i) => i.date === tomorrow && i.direction === "out")
    .map((i) => ({ ...i, status: "tomorrow" }));
  const overdue: AlertItem[] = listed
    .filter((i) => i.date < today && i.date >= oldest)
    .map((i) => ({ ...i, status: "overdue" }));

  const newlyOverdue = overdue.some((i) => i.date === yesterday);
  if (dueTomorrow.length === 0 && !newlyOverdue) return null;

  const all = [...dueTomorrow, ...overdue];
  const balances = new Map(accounts.map((a) => [a.id, a]));
  const byKey = new Map<string, AlertGroup>();
  for (const item of all) {
    const key = item.accountId ?? `sem:${item.accountName}`;
    let group = byKey.get(key);
    if (!group) {
      const account = item.accountId ? balances.get(item.accountId) : undefined;
      group = {
        accountId: item.accountId,
        name: account?.name ?? item.accountName,
        balanceCents: account ? account.balanceCents : null,
        items: [],
        afterCents: null,
      };
      byKey.set(key, group);
    }
    group.items.push(item);
  }

  const groups = [...byKey.values()].map((g) => {
    // Amanhã primeiro, depois as atrasadas da mais antiga pra mais nova.
    g.items.sort((a, b) =>
      a.status === b.status ? a.date.localeCompare(b.date) : a.status === "tomorrow" ? -1 : 1,
    );
    const outs = g.items.filter((i) => i.direction === "out").reduce((s, i) => s + i.amountCents, 0);
    g.afterCents = g.balanceCents === null || outs === 0 ? null : g.balanceCents - outs;
    return g;
  });

  return { tomorrow, dueTomorrow, overdue, groups };
}
