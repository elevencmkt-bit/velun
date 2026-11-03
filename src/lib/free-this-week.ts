// "Livre esta semana": quanto dá pra gastar além do essencial até a
// próxima entrada garantida, sem passar do piso de segurança.
//
//   livre = disponível hoje
//         + entradas GARANTIDAS previstas até lá
//         − saídas previstas até lá (contas, faturas)
//         − pagamentos atrasados (ainda vão sair)
//         − gastos estimados até lá (limites das Metas)
//         − piso de segurança
//
// O prazo vai até a véspera da próxima entrada garantida, nunca menos
// que 7 dias (hoje e os 6 seguintes). Entrada variável (freela, show)
// não conta antes de cair: quando cai, já está no disponível. Sem
// entrada garantida à vista, o prazo é de 30 dias.
//
// Puro: entra o que a projeção já leu.

import { addDaysISO } from "@/lib/today";
import { estimatedBetween } from "@/lib/cash-flow-estimates";

export const FREE_MIN_DAYS = 7;
/** Sem entrada garantida à vista: até onde olhar. */
export const FREE_FALLBACK_DAYS = 30;
/** Até onde procurar a próxima entrada garantida. */
export const FREE_LOOKAHEAD_DAYS = 60;
/** Abaixo disso (e acima de zero): "só essenciais". */
export const FREE_ESSENTIALS_CENTS = 5000;

export type FreeEvent = {
  date: string;
  description: string;
  direction: "in" | "out";
  amount_cents: number;
  certainty?: "guaranteed" | "variable" | null;
};

export type FreeThisWeek = {
  /** Último dia que a conta cobre (inclusive). */
  until: string;
  /** A próxima entrada garantida (depois de hoje), se houver em 60 dias. */
  nextIncome: { description: string; date: string; amountCents: number } | null;
  availableCents: number;
  /** Entradas garantidas até `until`. */
  incomeCents: number;
  /** Saídas previstas até `until`. */
  outCents: number;
  overdueOutCents: number;
  estimatedCents: number;
  floorCents: number;
  freeCents: number;
  state: "free" | "essentials" | "short";
};

export function computeFreeThisWeek(input: {
  today: string;
  availableCents: number;
  events: FreeEvent[];
  estimateByDate: Map<string, number>;
  floorCents: number;
  overdueOutCents: number;
}): FreeThisWeek {
  const { today, availableCents, events, estimateByDate, floorCents, overdueOutCents } = input;
  const lookahead = addDaysISO(today, FREE_LOOKAHEAD_DAYS);
  const guaranteed = (e: FreeEvent) => e.direction === "in" && e.certainty === "guaranteed";

  const next =
    [...events]
      .filter((e) => guaranteed(e) && e.date > today && e.date <= lookahead)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const minUntil = addDaysISO(today, FREE_MIN_DAYS - 1);
  const until = next
    ? [addDaysISO(next.date, -1), minUntil].sort().pop()!
    : addDaysISO(today, FREE_FALLBACK_DAYS - 1);

  const inWindow = (e: FreeEvent) => e.date >= today && e.date <= until;
  const incomeCents = events.filter((e) => inWindow(e) && guaranteed(e)).reduce((n, e) => n + e.amount_cents, 0);
  const outCents = events.filter((e) => inWindow(e) && e.direction === "out").reduce((n, e) => n + e.amount_cents, 0);
  const estimatedCents = estimatedBetween(estimateByDate, today, until);

  const freeCents = availableCents + incomeCents - outCents - overdueOutCents - estimatedCents - floorCents;
  const state = freeCents >= FREE_ESSENTIALS_CENTS ? "free" : freeCents >= 0 ? "essentials" : "short";

  return {
    until,
    nextIncome: next ? { description: next.description, date: next.date, amountCents: next.amount_cents } : null,
    availableCents,
    incomeCents,
    outCents,
    overdueOutCents,
    estimatedCents,
    floorCents,
    freeCents,
    state,
  };
}
