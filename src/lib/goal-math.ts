import { monthRange } from "@/lib/month";

// Contas das metas, sem banco: dá pra usar no navegador e testar.

export type GoalKind = "save" | "limit" | "debt";
export type Pace = "on_track" | "behind" | "done" | null;

/** Meses até a data, contando o mês da data e não o de hoje (mín. 1). */
export function monthsUntil(today: string, target: string): number {
  const [y, m] = today.split("-").map(Number);
  const [ty, tm] = target.split("-").map(Number);
  return Math.max(1, (ty - y) * 12 + (tm - m));
}

/** Quanto do caminho entre `from` e `to` já passou, de 0 a 1. */
export function elapsedFraction(from: string, to: string, today: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  const t = Date.parse(`${today}T12:00:00Z`);
  if (!(b > a)) return 1;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/**
 * Juntar: no ritmo se o guardado está pelo menos onde a linha reta do
 * começo até a data diz que deveria estar (1% de folga).
 */
export function savePace(p: {
  startCents: number;
  savedCents: number;
  targetCents: number;
  createdOn: string;
  targetDate: string | null;
  today: string;
}): { pace: Pace; monthsLeft: number | null; perMonthCents: number | null } {
  const missing = p.targetCents - p.savedCents;
  if (missing <= 0) return { pace: "done", monthsLeft: null, perMonthCents: null };
  if (!p.targetDate) return { pace: null, monthsLeft: null, perMonthCents: null };
  const monthsLeft = monthsUntil(p.today, p.targetDate);
  const f = elapsedFraction(p.createdOn, p.targetDate, p.today);
  const expected = p.startCents + (p.targetCents - p.startCents) * f;
  const pace: Pace = p.savedCents + p.targetCents * 0.01 >= expected ? "on_track" : "behind";
  return { pace, monthsLeft, perMonthCents: Math.ceil(missing / monthsLeft) };
}

/** Dívida: no ritmo se o que falta está no máximo onde a linha reta diz. */
export function debtPace(p: {
  startCents: number;
  remainingCents: number;
  createdOn: string;
  targetDate: string | null;
  today: string;
}): { pace: Pace; monthsLeft: number | null; perMonthCents: number | null } {
  if (p.remainingCents <= 0) return { pace: "done", monthsLeft: null, perMonthCents: null };
  if (!p.targetDate) return { pace: null, monthsLeft: null, perMonthCents: null };
  const monthsLeft = monthsUntil(p.today, p.targetDate);
  const f = elapsedFraction(p.createdOn, p.targetDate, p.today);
  const expected = p.startCents * (1 - f);
  const pace: Pace = p.remainingCents <= expected + p.startCents * 0.01 ? "on_track" : "behind";
  return { pace, monthsLeft, perMonthCents: Math.ceil(p.remainingCents / monthsLeft) };
}

/** Fim de cada mês entre duas datas (AAAA-MM-DD), mais `to` no fim. */
export function monthEnds(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  for (;;) {
    const end = monthRange(y, m - 1).end;
    if (end >= to) break;
    out.push(end);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  out.push(to);
  return out;
}


/**
 * Previsão pelo ritmo de verdade: com `ratePerMonth` (média recente), em
 * que mês o que falta acaba. Null se o ritmo não ajuda (zero ou contra).
 */
export function projectFinish(today: string, missingCents: number, ratePerMonth: number): string | null {
  if (missingCents <= 0 || !(ratePerMonth > 0)) return null;
  const months = Math.ceil(missingCents / ratePerMonth);
  if (months > 1200) return null;
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Mesma data N dias antes (AAAA-MM-DD). */
export function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Próximas datas de uma transferência mensal no dia `day`, a partir de
 * amanhã, até `until` (inclusive) ou `max` meses.
 */
export function monthlyDates(today: string, day: number, until: string | null, max: number): string[] {
  const out: string[] = [];
  let [y, m] = today.split("-").map(Number);
  const todayDay = Number(today.slice(8));
  if (day <= todayDay) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  while (out.length < max) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const date = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
    if (until && date > until) break;
    out.push(date);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
