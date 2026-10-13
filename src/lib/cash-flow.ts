import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountScope } from "@/lib/visibility";
import { getAccountBalances } from "@/lib/balances";
import { cardBillsForScope } from "@/lib/cards";

export type CashFlowEvent = {
  id: string;
  type: "income" | "expense";
  label: string;
  amount_cents: number;
};

export type CashFlowPoint = {
  date: string;
  label: string;
  balance_cents: number;
  /** Saldo se os lançamentos atrasados ainda saírem (só quando pedido). */
  with_overdue_cents?: number;
  events: CashFlowEvent[];
};

/** Pendentes com data que já passou: ficam fora da projeção. */
export type OverdueSummary = {
  count: number;
  /** Saídas menos entradas atrasadas (positivo = vai faltar dinheiro). */
  netOutCents: number;
};

export type UpcomingEvent = {
  id: string;
  date: string;
  description: string;
  direction: "in" | "out";
  amount_cents: number;
  category_name: string | null;
};

export type CashFlowInsight = {
  headline: string;
  bullets: { text: string; tone: "positive" | "warning" }[];
};

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Saldo atual + pendentes projetado dia a dia — mesma lógica usada pela
// tela Fluxo de caixa e pelo card-resumo do Dashboard, só o horizonte muda.
export async function getCashFlowProjection(
  supabase: SupabaseClient,
  householdId: string,
  horizonDays: number,
  scope: AccountScope,
  /** Hoje no fuso da casa (AAAA-MM-DD). */
  todayISO?: string,
  options: { includeOverdue?: boolean } = {},
) {
  const today = todayISO ? new Date(`${todayISO}T00:00:00`) : new Date(new Date().toDateString());
  const horizon = addDays(today, horizonDays);

  const [balances, { data: pending }, { cardIds, bills }, { data: overdueRows }] = await Promise.all([
    getAccountBalances(supabase, householdId, scope),
    supabase
      // limite: pendentes da projeção (até 90 dias)
      .from("transactions")
      .select("id, date, description, amount_cents, direction, account_id, category:categories(name)")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .in("account_id", scope.ids)
      .gte("date", toISO(today))
      .lte("date", toISO(horizon))
      .order("date", { ascending: true }),
    cardBillsForScope(supabase, householdId, scope.ids, toISO(today)),
    // Atrasados: pendentes com data antes de hoje. A projeção começa hoje,
    // então eles ficariam de fora em silêncio — a tela avisa e deixa incluir.
    supabase
      // limite: pendentes atrasados, poucas dezenas
      .from("transactions")
      .select("amount_cents, direction, account_id")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .in("account_id", scope.ids)
      .lt("date", toISO(today)),
  ]);

  // Cartão fica fora do saldo em dinheiro: compra no cartão não tira
  // dinheiro da conta no dia — quem tira é o pagamento da fatura, que
  // entra abaixo como saída no vencimento.
  const currentTotal = Array.from(balances.entries())
    .filter(([id]) => !cardIds.has(id))
    .reduce((sum, [, v]) => sum + v, 0);

  type Row = {
    id: string;
    date: string;
    description: string;
    amount_cents: number;
    direction: "in" | "out";
    category: unknown;
  };
  const rows: Row[] = [
    ...((pending ?? []) as (Row & { account_id?: string })[]).filter((r) => !cardIds.has(r.account_id ?? "")),
    ...bills
      .filter((b) => b.date >= toISO(today) && b.date <= toISO(horizon))
      .map((b) => ({
        id: `fatura:${b.id}`,
        date: b.date,
        description: `Fatura · ${b.cardName}`,
        amount_cents: b.amountCents,
        direction: "out" as const,
        category: null,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const eventsByDate = new Map<string, CashFlowEvent[]>();
  const upcomingEvents: UpcomingEvent[] = [];
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of rows) {
    const isIncome = row.direction === "in";
    if (isIncome) totalIncome += row.amount_cents;
    else totalExpense += row.amount_cents;

    const list = eventsByDate.get(row.date) ?? [];
    list.push({
      id: row.id,
      type: isIncome ? "income" : "expense",
      label: row.description,
      amount_cents: isIncome ? row.amount_cents : -row.amount_cents,
    });
    eventsByDate.set(row.date, list);

    upcomingEvents.push({
      id: row.id,
      date: row.date,
      description: row.description,
      direction: row.direction,
      amount_cents: row.amount_cents,
      category_name: single<{ name: string }>(row.category as { name: string } | null)?.name ?? null,
    });
  }

  const points: CashFlowPoint[] = [];
  let running = currentTotal;
  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const iso = toISO(d);
    const dayEvents = eventsByDate.get(iso) ?? [];
    for (const event of dayEvents) running += event.amount_cents;
    points.push({
      date: iso,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      balance_cents: running,
      events: dayEvents,
    });
  }

  const overdueList = ((overdueRows ?? []) as { amount_cents: number; direction: string; account_id: string }[])
    .filter((r) => !cardIds.has(r.account_id));
  const overdue: OverdueSummary = {
    count: overdueList.length,
    netOutCents: overdueList.reduce((n, r) => n + (r.direction === "out" ? r.amount_cents : -r.amount_cents), 0),
  };
  if (options.includeOverdue && overdue.count > 0) {
    for (const p of points) p.with_overdue_cents = p.balance_cents - overdue.netOutCents;
  }

  let lowestPoint = points[0];
  for (const p of points) {
    if (p.balance_cents < lowestPoint.balance_cents) lowestPoint = p;
  }
  const finalPoint = points[points.length - 1];

  const negativeDays = points.filter((p) => p.balance_cents < 0).length;
  const negativeDaysPct = Math.round((negativeDays / points.length) * 100);
  const netResult = totalIncome - totalExpense;

  // Callouts do gráfico: só os eventos mais relevantes (maior valor
  // absoluto) viram marcador — o resto fica só no tooltip e na lista.
  const highlightedEventIds = new Set(
    [...upcomingEvents]
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, 4)
      .map((e) => e.id),
  );

  // Os mesmos números, contando os atrasados como se saíssem hoje.
  const withOverdue =
    options.includeOverdue && overdue.count > 0
      ? (() => {
          const value = (p: CashFlowPoint) => p.with_overdue_cents ?? p.balance_cents;
          let low = points[0];
          for (const p of points) if (value(p) < value(low)) low = p;
          return {
            lowestCents: value(low),
            lowestPoint: low,
            finalCents: value(finalPoint),
            negativeDays: points.filter((p) => value(p) < 0).length,
          };
        })()
      : null;

  return {
    points,
    overdue,
    withOverdue,
    currentTotal,
    lowestPoint,
    finalPoint,
    negativeDays,
    negativeDaysPct,
    totalIncome,
    totalExpense,
    netResult,
    upcomingEvents,
    highlightedEventIds,
  };
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });

/**
 * Uma frase sobre o que vale ficar de olho na projeção — com datas e
 * nomes de verdade, nada de conselho genérico.
 */
export function buildCashFlowNote(input: {
  points: CashFlowPoint[];
  upcomingEvents: UpcomingEvent[];
  value?: (p: CashFlowPoint) => number;
  formatMoney: (cents: number) => string;
}): string {
  const { points, upcomingEvents, formatMoney } = input;
  const value = input.value ?? ((p: CashFlowPoint) => p.balance_cents);
  if (points.length === 0) return "";

  const firstNeg = points.findIndex((p) => value(p) < 0);
  const last = points[points.length - 1];

  if (firstNeg === -1) {
    const biggest = [...upcomingEvents]
      .filter((e) => e.direction === "out")
      .sort((a, b) => b.amount_cents - a.amount_cents)[0];
    return biggest
      ? `O saldo fica positivo o período todo. A maior saída prevista é ${biggest.description} (${formatMoney(biggest.amount_cents)}), em ${shortDate(biggest.date)}.`
      : "O saldo fica positivo o período todo.";
  }

  if (value(last) < 0) {
    const nextIn = upcomingEvents.find((e) => e.direction === "in" && e.date >= points[firstNeg].date);
    return `O saldo termina o período no negativo (${formatMoney(value(last))}).${
      nextIn ? ` A próxima entrada prevista é ${nextIn.description}, em ${shortDate(nextIn.date)}.` : " Não há entradas previstas pra cobrir."
    }`;
  }

  // Volta ao positivo: em que dia, com qual entrada, e se cai de novo.
  let recovery = -1;
  for (let i = firstNeg; i < points.length; i++) {
    if (value(points[i]) >= 0) {
      recovery = i;
      break;
    }
  }
  const day = points[recovery];
  const lift = day.events.filter((e) => e.type === "income").sort((a, b) => b.amount_cents - a.amount_cents)[0];
  const fallsAgain = points.slice(recovery).some((p) => value(p) < 0);
  const start = firstNeg === 0 ? "O saldo está negativo" : `O saldo fica negativo a partir de ${shortDate(points[firstNeg].date)}`;
  return `${start} até ${shortDate(day.date)}${lift ? `, quando entra ${lift.label}, de ${formatMoney(lift.amount_cents)}` : ""}. ${
    fallsAgain ? "Depois volta a ficar no vermelho em alguns dias — vale olhar o gráfico." : "Depois disso, não volta a ficar no vermelho."
  }`;
}
