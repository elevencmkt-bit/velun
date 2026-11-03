// Gastos estimados na projeção do Fluxo de caixa.
//
// A projeção só via o que está lançado: aluguel, salário, assinaturas.
// Mercado, gasolina e restaurante não têm lançamento antes de acontecer,
// e a tela ficava otimista demais. Os limites de gasto das Metas dizem
// quanto se espera gastar por mês em cada categoria: eles viram saídas
// estimadas, espalhadas igual por dia.
//
// Regras:
// - Mês corrente: só o que ainda falta gastar. Estimado = limite − gasto
//   confirmado no mês − saídas já previstas na categoria até o fim do mês
//   (nunca abaixo de zero), espalhado de hoje até o último dia do mês.
// - Meses seguintes: limite − saídas previstas na categoria naquele mês
//   (a parcela do carro em Transporte já está lançada: estima só o resto),
//   espalhado pelos dias do mês.
// - No fim do horizonte, o mês entra só com os dias que cabem.
//
// Puro: entra o que foi lido do banco, sai o estimado por dia.

import { addDaysISO } from "@/lib/today";

export type SpendingLimit = {
  /** Categoria (a raiz que o limite cobre, com as subcategorias). */
  categoryId: string;
  name: string;
  limitCents: number;
};

export type CategoryEstimate = {
  categoryId: string;
  name: string;
  limitCents: number;
  /** Gasto confirmado no mês corrente. */
  spentCents: number;
  /** Saídas previstas na categoria, de hoje até o fim do mês corrente. */
  plannedThisMonthCents: number;
  /** O que ainda entra como estimado no mês corrente. */
  remainingThisMonthCents: number;
  /** Estimado num mês seguinte (o próximo), já sem o que está previsto nele. */
  nextMonthCents: number;
  /** Total estimado dentro do horizonte. */
  totalCents: number;
};

export type SpendingEstimate = {
  /** Estimado de cada dia (AAAA-MM-DD → centavos), do dia 0 ao horizonte. */
  byDate: Map<string, number>;
  categories: CategoryEstimate[];
  totalCents: number;
};

const monthKey = (iso: string) => iso.slice(0, 7);

function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function lastDayOfMonth(key: string): string {
  return `${key}-${String(daysInMonth(key)).padStart(2, "0")}`;
}

/** Parte inteira de `total` que cabe no i-ésimo de `n` pedaços (somam exatamente `total`). */
function share(total: number, i: number, n: number): number {
  return Math.round((total * (i + 1)) / n) - Math.round((total * i) / n);
}

export function estimateSpending(input: {
  limits: SpendingLimit[];
  /** Gasto confirmado no mês corrente, por categoria do limite. */
  spentThisMonth: Map<string, number>;
  /** Saídas previstas (pendentes, de hoje em diante) por "categoria|AAAA-MM". */
  planned: Map<string, number>;
  today: string;
  horizonDays: number;
}): SpendingEstimate {
  const { limits, spentThisMonth, planned, today, horizonDays } = input;
  const horizon = addDaysISO(today, horizonDays);
  const byDate = new Map<string, number>();
  const categories: CategoryEstimate[] = [];
  let totalCents = 0;

  const thisMonth = monthKey(today);
  const nextMonth = monthKey(addDaysISO(lastDayOfMonth(thisMonth), 1));

  for (const limit of limits) {
    const plannedIn = (key: string) => planned.get(`${limit.categoryId}|${key}`) ?? 0;
    const spent = spentThisMonth.get(limit.categoryId) ?? 0;
    const remainingThisMonth = Math.max(0, limit.limitCents - spent - plannedIn(thisMonth));
    let catTotal = 0;

    // Mês a mês, do corrente até o do horizonte.
    let key = thisMonth;
    while (key <= monthKey(horizon)) {
      const monthTotal = key === thisMonth ? remainingThisMonth : Math.max(0, limit.limitCents - plannedIn(key));
      // Dias em que o valor do mês se espalha: no corrente, de hoje ao fim.
      const first = key === thisMonth ? today : `${key}-01`;
      const last = lastDayOfMonth(key);
      const n = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1;
      for (let i = 0; i < n; i++) {
        const day = addDaysISO(first, i);
        if (day > horizon) break;
        const cents = share(monthTotal, i, n);
        if (cents === 0) continue;
        byDate.set(day, (byDate.get(day) ?? 0) + cents);
        catTotal += cents;
      }
      key = monthKey(addDaysISO(last, 1));
    }

    totalCents += catTotal;
    categories.push({
      categoryId: limit.categoryId,
      name: limit.name,
      limitCents: limit.limitCents,
      spentCents: spent,
      plannedThisMonthCents: plannedIn(thisMonth),
      remainingThisMonthCents: remainingThisMonth,
      nextMonthCents: Math.max(0, limit.limitCents - plannedIn(nextMonth)),
      totalCents: catTotal,
    });
  }

  categories.sort((a, b) => b.limitCents - a.limitCents);
  return { byDate, categories, totalCents };
}

/** Estimado acumulado até cada dia (inclusive), na ordem das datas dadas. */
export function cumulative(dates: string[], byDate: Map<string, number>): number[] {
  let acc = 0;
  return dates.map((d) => {
    acc += byDate.get(d) ?? 0;
    return acc;
  });
}

/** Soma do estimado entre duas datas (inclusive). */
export function estimatedBetween(byDate: Map<string, number>, from: string, to: string): number {
  let sum = 0;
  for (const [d, cents] of byDate) if (d >= from && d <= to) sum += cents;
  return sum;
}

// ── A série que a tela mostra ───────────────────────────────────────────

type SeriesPoint = {
  date: string;
  balance_cents: number;
  reference_cents?: number;
  estimated_cents?: number;
  with_overdue_cents?: number;
};

/**
 * O saldo projetado como a tela mostra: o lançado, menos o estimado
 * acumulado até o dia (quando ligado), menos os atrasados (quando
 * incluídos). Quando algum dos dois entra, `reference_cents` guarda a
 * linha só com o que está lançado, pra comparar. E os números do topo
 * saem da mesma série.
 */
export function buildSeries<P extends SeriesPoint>(
  points: P[],
  options: { estimateByDate?: Map<string, number> | null; overdueNetOutCents?: number; floorCents?: number },
) {
  const est = options.estimateByDate ?? null;
  const overdue = options.overdueNetOutCents ?? 0;
  const adjusted = Boolean(est) || overdue !== 0;
  const cum = est ? cumulative(points.map((p) => p.date), est) : points.map(() => 0);

  const series: P[] = points.map((p, i) => ({
    ...p,
    balance_cents: p.balance_cents - cum[i] - overdue,
    ...(adjusted ? { reference_cents: p.balance_cents } : {}),
    ...(est ? { estimated_cents: est.get(p.date) ?? 0 } : {}),
    with_overdue_cents: undefined,
  }));

  let lowest = series[0];
  for (const p of series) if (p.balance_cents < lowest.balance_cents) lowest = p;
  const floor = options.floorCents ?? 0;
  return {
    series,
    lowest,
    final: series[series.length - 1],
    negativeDays: series.filter((p) => p.balance_cents < 0).length,
    firstNegative: series.find((p) => p.balance_cents < 0) ?? null,
    belowFloorDays: floor > 0 ? series.filter((p) => p.balance_cents < floor).length : 0,
    /** Final só com o lançado (sem estimados nem atrasados). */
    referenceFinal: points[points.length - 1]?.balance_cents ?? 0,
  };
}
