import { formatCents, type CurrencyCode } from "@/lib/money";
import { addDaysISO } from "@/lib/today";

// Formatação dos e-mails: datas em português e valores com sinal.
// Tudo puro (sem fuso do servidor): as datas são AAAA-MM-DD da casa.

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: string): number {
  return parts(iso).weekday;
}

/** "23/10" */
export function ddmm(iso: string): string {
  const { m, d } = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "sexta, 23/10" */
export function weekdayDate(iso: string): string {
  return `${WEEKDAYS[parts(iso).weekday]}, ${ddmm(iso)}`;
}

/** "sex" */
export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[parts(iso).weekday];
}

/** 23 */
export function dayNumber(iso: string): number {
  return parts(iso).d;
}

/** "Terça, 20 de outubro" */
export function longDate(iso: string): string {
  const { m, d, weekday } = parts(iso);
  const w = WEEKDAYS[weekday];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d} de ${MONTHS[m - 1]}`;
}

/** "19 a 25 de outubro" / "28 de setembro a 4 de outubro" */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.m === b.m) return `${a.d} a ${b.d} de ${MONTHS[b.m - 1]}`;
  return `${a.d} de ${MONTHS[a.m - 1]} a ${b.d} de ${MONTHS[b.m - 1]}`;
}

/** "setembro" a partir de "2026-09" ou "2026-09-30". */
export function monthName(isoOrMonth: string): string {
  const m = Number(isoOrMonth.split("-")[1]);
  return MONTHS[m - 1];
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Primeiro e último dia de um mês "AAAA-MM". */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Mês anterior a "AAAA-MM". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mês de uma data AAAA-MM-DD. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** "$85.00" (sem sinal). */
export function money(cents: number, currency: CurrencyCode): string {
  return formatCents(Math.abs(cents), currency);
}

/** "−$85.00" / "+$400.00". */
export function signed(cents: number, currency: CurrencyCode): string {
  if (cents === 0) return money(0, currency);
  return `${cents < 0 ? "−" : "+"}${money(cents, currency)}`;
}

/** Saldo: "$1,621.91" ou "−$103.39". */
export function balance(cents: number, currency: CurrencyCode): string {
  return `${cents < 0 ? "−" : ""}${money(cents, currency)}`;
}

/** Valor curto, sem centavos quando redondo: "$282", "$1,284.60". */
export function moneyShort(cents: number, currency: CurrencyCode): string {
  const full = money(cents, currency);
  return cents % 100 === 0 ? full.replace(/[.,]00(?=\D*$)/, "") : full;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
