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
