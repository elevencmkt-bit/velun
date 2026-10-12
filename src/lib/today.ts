// "Hoje" no fuso da casa, não no do servidor (UTC). Em Orlando, das 20h à
// meia-noite, UTC já é o dia seguinte — e o app marcava como atrasado o
// que vence hoje à noite.

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayIn(timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    }
    formatters.set(timeZone, f);
  }
  return f.format(new Date());
}

/** Soma dias a uma data AAAA-MM-DD, sem depender do fuso do servidor. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hoje no aparelho de quem está usando (componentes do navegador). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
