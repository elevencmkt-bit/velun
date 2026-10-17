// Seção 5 da spec: materializar as próximas N ocorrências como `pending`
// quando a recorrência é criada ou editada — nunca gerar sob demanda na
// leitura. Esta função só calcula as datas; quem grava é a server action.

export type RecurrenceFrequency = "monthly" | "weekly" | "yearly";

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function clampedMonthDay(monthStart: Date, day: number): Date {
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(day, lastDay));
}

export function generateOccurrenceDates(params: {
  frequency: RecurrenceFrequency;
  startsOn: string;
  dayOfMonth: number | null;
  endsOn: string | null;
  count: number;
  from?: string;
}): string[] {
  const starts = parseISODate(params.startsOn);
  const from = params.from ? parseISODate(params.from) : new Date(new Date().toDateString());
  const ends = params.endsOn ? parseISODate(params.endsOn) : null;
  const floor = starts > from ? starts : from;

  const dates: Date[] = [];

  if (params.frequency === "weekly") {
    let d = new Date(starts);
    while (d < floor) d = addDays(d, 7);
    while (dates.length < params.count) {
      if (ends && d > ends) break;
      dates.push(new Date(d));
      d = addDays(d, 7);
    }
  } else if (params.frequency === "yearly") {
    let year = starts.getFullYear();
    let d = new Date(year, starts.getMonth(), starts.getDate());
    while (d < floor) {
      year += 1;
      d = new Date(year, starts.getMonth(), starts.getDate());
    }
    while (dates.length < params.count) {
      if (ends && d > ends) break;
      dates.push(new Date(d));
      year += 1;
      d = new Date(year, starts.getMonth(), starts.getDate());
    }
  } else {
    const day = params.dayOfMonth ?? starts.getDate();
    let cursor = new Date(starts.getFullYear(), starts.getMonth(), 1);
    let d = clampedMonthDay(cursor, day);
    while (d < floor) {
      cursor = addMonths(cursor, 1);
      d = clampedMonthDay(cursor, day);
    }
    while (dates.length < params.count) {
      if (ends && d > ends) break;
      dates.push(d);
      cursor = addMonths(cursor, 1);
      d = clampedMonthDay(cursor, day);
    }
  }

  return dates.map(toISODate);
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "toda sexta", "todo dia 21", "todo ano em 05/03". */
export function describeSchedule(params: {
  frequency: RecurrenceFrequency;
  startsOn: string;
  dayOfMonth: number | null;
}): string {
  const d = parseISODate(params.startsOn);
  if (params.frequency === "weekly") {
    const w = d.getDay();
    // "todo sábado/domingo", "toda segunda…sexta"
    return `${w === 0 || w === 6 ? "todo" : "toda"} ${WEEKDAYS[w]}`;
  }
  if (params.frequency === "yearly") {
    return `todo ano em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return `todo dia ${params.dayOfMonth ?? d.getDate()}`;
}

/**
 * Ao salvar um lançamento que faz parte de uma recorrência, em quais
 * aplicar. "Todos, inclusive os que já passaram" só vale pra nome e
 * categoria: valor (ou entrada/saída) de lançamento que já caiu não muda,
 * é o que aconteceu.
 */
export type RecurrenceScope = "one" | "future" | "all";

export function recurrenceScopes(changes: {
  amount: boolean;
  direction: boolean;
  description: boolean;
  category: boolean;
}): { ask: boolean; allowAll: boolean } {
  const ask = changes.amount || changes.direction || changes.description || changes.category;
  return { ask, allowAll: ask && !changes.amount && !changes.direction };
}
