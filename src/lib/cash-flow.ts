import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountBalances } from "@/lib/balances";

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
  events: CashFlowEvent[];
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
) {
  const today = new Date(new Date().toDateString());
  const horizon = addDays(today, horizonDays);

  const [balances, { data: pending }] = await Promise.all([
    getAccountBalances(supabase, householdId),
    supabase
      .from("transactions")
      .select("id, date, description, amount_cents, direction, category:categories(name)")
      .eq("household_id", householdId)
      .eq("status", "pending")
      .gte("date", toISO(today))
      .lte("date", toISO(horizon))
      .order("date", { ascending: true }),
  ]);

  const currentTotal = Array.from(balances.values()).reduce((sum, v) => sum + v, 0);

  const eventsByDate = new Map<string, CashFlowEvent[]>();
  const upcomingEvents: UpcomingEvent[] = [];
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of pending ?? []) {
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
      category_name: single<{ name: string }>(row.category)?.name ?? null,
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

  return {
    points,
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

export function buildCashFlowInsight(input: {
  points: CashFlowPoint[];
  finalPoint: CashFlowPoint;
  negativeDays: number;
  negativeDaysPct: number;
  upcomingEvents: UpcomingEvent[];
  periodLabel: string;
}): CashFlowInsight {
  const { points, finalPoint, negativeDays, negativeDaysPct, upcomingEvents, periodLabel } = input;
  const bullets: CashFlowInsight["bullets"] = [];

  const biggestExpense = [...upcomingEvents]
    .filter((e) => e.direction === "out")
    .sort((a, b) => b.amount_cents - a.amount_cents)[0];
  const nextIncome = upcomingEvents.find((e) => e.direction === "in");

  let headline: string;

  if (negativeDays === 0) {
    headline = `Seu saldo se mantém positivo durante toda a projeção de ${periodLabel}.`;
    if (biggestExpense) {
      bullets.push({
        text: `Maior saída prevista: ${biggestExpense.description}. Vale conferir se ela já está considerada no seu planejamento.`,
        tone: "positive",
      });
    }
  } else if (finalPoint.balance_cents >= 0) {
    const firstNegativeIndex = points.findIndex((p) => p.balance_cents < 0);
    let recoveryIndex = -1;
    for (let i = firstNegativeIndex; i < points.length; i++) {
      if (points[i].balance_cents >= 0) {
        recoveryIndex = i;
        break;
      }
    }
    headline =
      recoveryIndex > 0
        ? `Seu saldo volta ao positivo em ${recoveryIndex} dia${recoveryIndex === 1 ? "" : "s"}.`
        : `Seu saldo fica negativo em parte da projeção de ${periodLabel}.`;
    bullets.push({
      text: "Considere antecipar recebimentos ou adiar despesas não essenciais nesse intervalo.",
      tone: "warning",
    });
  } else {
    headline = `Seu saldo termina a projeção negativo, em ${finalPoint.label}.`;
    bullets.push({
      text: "O saldo não se recupera dentro do período selecionado — pode ajudar reduzir saídas previstas.",
      tone: "warning",
    });
    if (nextIncome) {
      bullets.push({
        text: `Próxima entrada que ajuda o saldo: ${nextIncome.description}, em ${new Date(
          `${nextIncome.date}T00:00:00`,
        ).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}.`,
        tone: "positive",
      });
    }
  }

  if (negativeDays > 0) {
    bullets.push({
      text: `${negativeDays} dia${negativeDays === 1 ? "" : "s"} no negativo (${negativeDaysPct}% do período).`,
      tone: "warning",
    });
  }

  return { headline, bullets: bullets.slice(0, 3) };
}
