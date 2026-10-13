// Período do relatório em PDF: rótulos, período anterior e como agrupar
// a evolução. Puro, pra testar sem banco.

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type ReportPeriod = {
  from: string;
  to: string;
  /** "Setembro de 2026", "Janeiro a setembro de 2026", "01/03/2026 a 15/04/2026". */
  label: string;
  kind: "month" | "year" | "custom";
  prev: { from: string; to: string; label: string };
  /** Mais de um mês: tabelas categoria × mês e evolução por mês. */
  multiMonth: boolean;
  /** Meses cobertos, "2026-01"…, em ordem. */
  months: string[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
const br = (s: string) => {
  const [y, m, d] = parts(s);
  return `${pad(d)}/${pad(m)}/${y}`;
};

function addDays(s: string, days: number) {
  const ms = Date.parse(`${s}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isValidDate(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
}

export function monthsCovered(from: string, to: string): string[] {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function shortMonth(month: string) {
  const [, m] = month.split("-").map(Number);
  return cap(MONTHS[m - 1].slice(0, 3));
}

export function buildPeriod(from: string, to: string): ReportPeriod {
  if (to < from) [from, to] = [to, from];
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  const months = monthsCovered(from, to);

  const fullMonth = fy === ty && fm === tm && fd === 1 && td === lastDay(ty, tm);
  const startsJan1 = fm === 1 && fd === 1;
  const sameYear = fy === ty;

  if (fullMonth) {
    const py = fm === 1 ? fy - 1 : fy;
    const pm = fm === 1 ? 12 : fm - 1;
    return {
      from,
      to,
      kind: "month",
      label: cap(monthName(`${fy}-${pad(fm)}`)),
      prev: { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)), label: MONTHS[pm - 1] },
      multiMonth: false,
      months,
    };
  }

  if (sameYear && startsJan1 && fm === 1) {
    // Ano (inteiro ou até um mês): compara com o mesmo trecho do ano anterior.
    const toPrev = iso(ty - 1, tm, Math.min(td, lastDay(ty - 1, tm)));
    const endsDec31 = tm === 12 && td === 31;
    const lastFull = td === lastDay(ty, tm);
    return {
      from,
      to,
      kind: "year",
      label: endsDec31
        ? `Ano de ${ty}`
        : lastFull
          ? `Janeiro a ${MONTHS[tm - 1]} de ${ty}`
          : `01/01/${ty} a ${br(to)}`,
      prev: { from: iso(fy - 1, 1, 1), to: toPrev, label: `mesmo período de ${fy - 1}` },
      multiMonth: months.length > 1,
      months,
    };
  }

  // Datas livres: o período anterior tem o mesmo número de dias, logo antes.
  const len = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  return {
    from,
    to,
    kind: "custom",
    label: `${br(from)} a ${br(to)}`,
    prev: { from: addDays(prevTo, -(len - 1)), to: prevTo, label: "período anterior" },
    multiMonth: months.length > 1,
    months,
  };
}

export { addDays, br as formatDateBr };
