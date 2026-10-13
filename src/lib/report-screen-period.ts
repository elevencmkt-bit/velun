// Período da tela de Relatórios: um mês (o normal), um ano, todo o
// período ou datas livres. Puro, pra testar sem banco.
//
// No mês a tela compara com o mês anterior. No ano, com o mesmo trecho do
// ano anterior. Em "todo o período" e "de/até" não há comparação: a tela
// mostra médias por mês no lugar.

import { formatDateBr, isValidDate } from "@/lib/report-pdf/period";

export type ScreenPeriod =
  | { kind: "month"; year: number; monthIndex: number }
  | { kind: "year"; year: number }
  | { kind: "all" }
  | { kind: "range"; from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Lê a URL: de/até > ano > todo o período > mês (padrão: mês de hoje). */
export function parseScreenPeriod(
  params: { month?: string; year?: string; all?: string; from?: string; to?: string },
  today: string,
): ScreenPeriod {
  if (isValidDate(params.from) && isValidDate(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    return { kind: "range", from, to };
  }
  if (params.year && /^\d{4}$/.test(params.year)) {
    const y = Number(params.year);
    if (y >= 1900 && y <= 2200) return { kind: "year", year: y };
  }
  if (params.all === "1") return { kind: "all" };
  const m = params.month?.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return { kind: "month", year: Number(m[1]), monthIndex: Number(m[2]) - 1 };
  }
  return { kind: "month", year: Number(today.slice(0, 4)), monthIndex: Number(today.slice(5, 7)) - 1 };
}

/** O que buscar no banco. "Todo o período" busca tudo e descobre o início pelos lançamentos. */
export function fetchBounds(period: ScreenPeriod): { from: string; to: string } {
  switch (period.kind) {
    case "month": {
      const m = period.monthIndex + 1;
      return { from: `${period.year}-${pad(m)}-01`, to: `${period.year}-${pad(m)}-${pad(lastDay(period.year, m))}` };
    }
    case "year":
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
    case "all":
      return { from: "1900-01-01", to: "9999-12-31" };
    case "range":
      return { from: period.from, to: period.to };
  }
}

/**
 * O trecho que a tela de fato cobre, pra contar meses, tirar média e
 * desenhar a evolução. No realizado, um período que inclui hoje termina
 * hoje: outubro ainda não acabou, então a média não divide por dezembro.
 */
export function effectiveBounds(
  period: ScreenPeriod,
  opts: { today: string; realized: boolean; firstDate: string | null; lastDate: string | null },
): { from: string; to: string } {
  const { today, realized, firstDate, lastDate } = opts;
  if (period.kind === "all") {
    const from = firstDate ?? today;
    const to = realized ? (lastDate && lastDate > today ? lastDate : today) : (lastDate ?? today);
    return from <= to ? { from, to } : { from: to, to: from };
  }
  const b = fetchBounds(period);
  if (period.kind === "month") return b;
  const to = realized && b.from <= today && today <= b.to ? today : b.to;
  return { from: b.from, to };
}

/** Comparação do ano: mesmo trecho do ano anterior. Nos outros períodos longos, nenhuma. */
export function yearComparison(
  year: number,
  effectiveTo: string,
): { from: string; to: string; label: string; inLabel: string } {
  const [, m, d] = effectiveTo.split("-").map(Number);
  const py = year - 1;
  const whole = m === 12 && d === 31;
  return {
    from: `${py}-01-01`,
    to: `${py}-${pad(m)}-${pad(Math.min(d, lastDay(py, m)))}`,
    label: String(py),
    inLabel: whole ? `em ${py}` : `no mesmo período de ${py}`,
  };
}

/** "jul/2024" */
export function shortMonthYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${SHORT[m - 1]}/${y}`;
}

/** "setembro de 2025", a partir de "2025-09" ou "2025-09-14". */
export function longMonthYear(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map(Number);
  return `${LONG[m - 1]} de ${y}`;
}

/** Rótulo do eixo: "set" num ano só; "set/25" quando passa de um ano. */
export function axisMonthLabel(isoMonth: string, multiYear: boolean): string {
  const [y, m] = isoMonth.split("-").map(Number);
  return multiYear ? `${SHORT[m - 1]}/${String(y).slice(2)}` : SHORT[m - 1];
}

/** Texto do botão do período: "Ano de 2026", "Todo o período", "01/03/26 – 13/10/26". */
export function selectorLabel(period: Exclude<ScreenPeriod, { kind: "month" }>): string {
  if (period.kind === "year") return `Ano de ${period.year}`;
  if (period.kind === "all") return "Todo o período";
  const short = (s: string) => formatDateBr(s).replace(/\/(\d{2})(\d{2})$/, "/$2");
  return `${short(period.from)} – ${short(period.to)}`;
}

/** "em 2026", "em todo o período", "no período" — pra "Sobrou …". */
export function inPhrase(period: Exclude<ScreenPeriod, { kind: "month" }>): string {
  if (period.kind === "year") return `em ${period.year}`;
  if (period.kind === "all") return "em todo o período";
  return "no período";
}

/** "de 2026", "de todo o período", "do período" — pra "das despesas …". */
export function ofPhrase(period: Exclude<ScreenPeriod, { kind: "month" }>): string {
  if (period.kind === "year") return `de ${period.year}`;
  if (period.kind === "all") return "de todo o período";
  return "do período";
}
