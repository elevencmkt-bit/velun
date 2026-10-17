import { addDaysISO } from "@/lib/today";
import type { CurrencyCode } from "@/lib/money";
import type { CashAccount, UpcomingItem } from "./upcoming";
import { daysBetween } from "./format";

// Contas da semana, sem banco: recebe saldos e lançamentos e devolve o que
// o e-mail mostra. Separado pra poder testar com números inventados.

/** Atrasado mais antigo que isso não entra (sobra de lançamento esquecido). */
export const OVERDUE_WINDOW_DAYS = 60;

export type AccountWeek = {
  id: string;
  name: string;
  todayCents: number;
  /** O que muda na semana, contando as atrasadas como se caíssem hoje. */
  deltaCents: number;
  endCents: number;
  /** Primeiro dia em que a conta fica negativa, e quanto falta no pior dia. */
  negative: { date: string; shortCents: number; cause: string | null } | null;
};

export type WeekSummary = {
  start: string;
  end: string;
  overdue: UpcomingItem[];
  days: { date: string; items: UpcomingItem[] }[];
  outCents: number;
  inCents: number;
  accounts: AccountWeek[];
  endTotalCents: number;
  /** Contas pessoais do outro que ficaram fora das somas. */
  excludedCount: number;
};

export function buildWeek(input: { today: string; accounts: CashAccount[]; items: UpcomingItem[]; excludedCount?: number }): WeekSummary {
  const { today, accounts, items } = input;
  const end = addDaysISO(today, 6);
  const oldest = addDaysISO(today, -OVERDUE_WINDOW_DAYS);
  const relevant = items.filter((i) => i.date >= oldest && i.date <= end);

  const overdue = relevant.filter((i) => i.date < today && !i.silent);
  const days = daysBetween(today, end)
    .map((date) => ({ date, items: relevant.filter((i) => i.date === date && !i.silent) }))
    .filter((d) => d.items.length > 0);

  const inWeek = relevant.filter((i) => i.date >= today && !i.silent && !i.transfer);
  const outCents = inWeek.filter((i) => i.direction === "out").reduce((s, i) => s + i.amountCents, 0);
  const inCents = inWeek.filter((i) => i.direction === "in").reduce((s, i) => s + i.amountCents, 0);

  const effect = (i: UpcomingItem) => (i.direction === "in" ? i.amountCents : -i.amountCents);

  const accountWeeks: AccountWeek[] = accounts.map((a) => {
    const mine = relevant.filter((i) => i.accountId === a.id);
    // Atrasadas: como se caíssem hoje.
    let running = a.balanceCents + mine.filter((i) => i.date < today).reduce((s, i) => s + effect(i), 0);
    let negative: AccountWeek["negative"] = null;
    let worst = running;
    if (running < 0) {
      negative = { date: today, shortCents: -running, cause: null };
    }
    for (const date of daysBetween(today, end)) {
      const dayItems = mine.filter((i) => i.date === date);
      if (dayItems.length === 0) continue;
      running += dayItems.reduce((s, i) => s + effect(i), 0);
      if (running < worst) worst = running;
      if (running < 0 && !negative) {
        const biggest = dayItems
          .filter((i) => i.direction === "out")
          .sort((x, y) => y.amountCents - x.amountCents)[0];
        negative = { date, shortCents: -running, cause: biggest?.description ?? null };
      }
    }
    if (negative) negative.shortCents = Math.max(negative.shortCents, -worst);
    return {
      id: a.id,
      name: a.name,
      todayCents: a.balanceCents,
      deltaCents: running - a.balanceCents,
      endCents: running,
      negative,
    };
  });

  // Conta parada (sem saldo e sem nada na semana) não precisa de linha.
  const shown = accountWeeks.filter((a) => a.todayCents !== 0 || a.deltaCents !== 0);

  return {
    start: today,
    end,
    overdue,
    days,
    outCents,
    inCents,
    accounts: shown,
    endTotalCents: accountWeeks.reduce((s, a) => s + a.endCents, 0),
    excludedCount: input.excludedCount ?? 0,
  };
}

export function weekSubject(w: WeekSummary, currency: CurrencyCode, short: (c: number, cur: CurrencyCode) => string): string {
  if (w.outCents === 0 && w.inCents === 0) {
    return w.overdue.length > 0
      ? `Sua semana: nada novo previsto, ${w.overdue.length === 1 ? "1 atrasada" : `${w.overdue.length} atrasadas`}`
      : "Sua semana: nada previsto";
  }
  const parts: string[] = [];
  if (w.outCents > 0) parts.push(`sai ${short(w.outCents, currency)}`);
  if (w.inCents > 0) parts.push(`entra ${short(w.inCents, currency)}`);
  return `Sua semana: ${parts.join(", ")}`;
}
