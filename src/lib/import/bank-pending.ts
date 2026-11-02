// Pendentes do banco: o que o app mostra em "Pending" e ainda não lançou.
//
// Entram no Velun marcados (bank_pending) e contam no saldo, como no app.
// Quando o lançamento de verdade chega, ele toma o lugar do pendente. O
// difícil é reconhecer que são o mesmo:
// - o nome muda ("PIE FECTION 10292109 3145" → "Pie Fection");
// - a data muda (o pendente é do dia da compra; o lançado, do dia em
//   que o banco lançou);
// - o valor às vezes muda (gorjeta no restaurante e no delivery, posto
//   que reserva um valor e cobra outro).

/** Pendente da Regions: "<NOME> <MMDDHHMM> <4 últimos do cartão>". */
const REGIONS_PENDING = /\s+(\d{2})(\d{2})(\d{2})(\d{2})\s+\d{4}$/;
/** Prefixos de maquininha e carteira, que não fazem parte do nome. */
const PREFIX = /^(?:\+|sq\s*\*|tst\s*\*|dd\s*\*|sp\s*\*|pp\s*\*|paypal\s*\*|ic\s*\*)\s*/i;

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Nome e data de um pendente. A data vem do código que o banco põe no
 * nome, quando tem ("10311149": 31/10, 11h49); senão, hoje. O ano é o de
 * hoje, ou o anterior se a data cairia no futuro (pendente de dezembro
 * visto em janeiro).
 */
export function readPending(raw: string, today: string): { description: string; date: string } {
  let text = raw.replace(/\s+/g, " ").trim();
  let date = today;
  const code = REGIONS_PENDING.exec(text);
  if (code) {
    const month = Number(code[1]);
    const day = Number(code[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = Number(today.slice(0, 4));
      const candidate = isoOf(year, month, day);
      date = candidate > today ? isoOf(year - 1, month, day) : candidate;
    }
    text = text.slice(0, code.index).trim();
  }
  text = text.replace(PREFIX, "").trim();
  return { description: text || raw.trim(), date };
}

/** Só as letras do começo do nome, pra comparar "PIE FECTION" com "Pie Fection". */
function nameKey(description: string): string {
  return readPending(description, "2000-01-01")
    .description.toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "")
    .slice(0, 6);
}

export function sameMerchant(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka.length < 3 || kb.length < 3) return false;
  return ka.startsWith(kb.slice(0, 4)) || kb.startsWith(ka.slice(0, 4));
}

export type PendingCandidate = {
  id: string;
  date: string;
  amountCents: number;
  direction: "in" | "out";
  description: string;
};

export type PendingMatch = { candidate: PendingCandidate; exact: boolean };

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Gorjeta e posto: até 35% (ou $5) a mais, ou um pouco a menos. */
function closeAmount(pending: number, posted: number): boolean {
  if (posted >= pending) return posted - pending <= Math.max(500, Math.round(pending * 0.35));
  return pending - posted <= Math.max(100, Math.round(pending * 0.1));
}

/**
 * O pendente que esta linha lançada substitui, ou null.
 *
 * O lançado vem no mesmo dia do pendente ou até 10 dias depois (2 antes,
 * por fuso e fim de semana). Valor igual basta. Valor diferente, só com
 * o mesmo nome e dentro da folga de gorjeta/posto. Entre vários, o de
 * valor igual e data mais perto.
 */
export function matchPending(
  row: { date: string; amountCents: number; direction: "in" | "out"; description: string },
  candidates: PendingCandidate[],
  taken: Set<string>,
): PendingMatch | null {
  let best: PendingMatch | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (taken.has(c.id) || c.direction !== row.direction) continue;
    const days = daysBetween(c.date, row.date);
    if (days < -2 || days > 10) continue;
    const exact = c.amountCents === row.amountCents;
    const named = sameMerchant(c.description, row.description);
    if (!exact && !(named && closeAmount(c.amountCents, row.amountCents))) continue;
    // Valor igual com nome igual ganha de tudo; depois valor igual; depois o nome.
    const score = (exact ? 0 : 100) + (named ? 0 : 50) + Math.abs(days);
    if (score < bestScore) {
      bestScore = score;
      best = { candidate: c, exact };
    }
  }
  return best;
}

/**
 * O pendente deste print já entrou antes (outro print, ainda pendente)?
 * Mesmo valor e sentido, mesmo nome, até 3 dias de diferença.
 */
export function isKnownPending(
  row: { date: string; amountCents: number; direction: "in" | "out"; description: string },
  existing: PendingCandidate[],
  taken: Set<string>,
): PendingCandidate | null {
  for (const c of existing) {
    if (taken.has(c.id) || c.direction !== row.direction || c.amountCents !== row.amountCents) continue;
    if (Math.abs(daysBetween(c.date, row.date)) > 3) continue;
    if (!sameMerchant(c.description, row.description)) continue;
    return c;
  }
  return null;
}

/** Pendente que passou disso sem lançar provavelmente era só uma reserva. */
export const STALE_PENDING_DAYS = 7;
