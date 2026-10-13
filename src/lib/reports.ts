// Agregações da tela Mês. Princípio 5 da spec vale aqui também: tudo
// deriva de `transactions`, nada é pré-calculado ou guardado.
// Transferências (transfer_group_id preenchido) nunca entram em
// receita/despesa — spec seção 5.

export type MonthTransaction = {
  id: string;
  account_id: string;
  date: string;
  amount_cents: number;
  direction: "in" | "out";
  description: string;
  transfer_group_id: string | null;
  category_name: string | null;
  account_name: string;
  /** Categoria de movimentação entre contas: fora de receita e despesa. */
  category_is_transfer?: boolean;
};

export function excludeTransfers(rows: MonthTransaction[]): MonthTransaction[] {
  return rows.filter((r) => !r.transfer_group_id && !r.category_is_transfer);
}

export function sumByDirection(rows: MonthTransaction[], direction: "in" | "out"): number {
  return rows.filter((r) => r.direction === direction).reduce((sum, r) => sum + r.amount_cents, 0);
}

const OTHER_BUCKET = "Outras categorias";
const MAX_SLICES = 8;

export type CategorySlice = { name: string; amount_cents: number };

// Ranking por categoria, com no máximo MAX_SLICES fatias — o resto
// agrupado em "Outras categorias". Usado pelos donuts (Mês e
// Relatórios), que perdem legibilidade com muitas fatias finas.
export function groupByCategoryCapped(
  rows: MonthTransaction[],
  direction: "in" | "out",
): CategorySlice[] {
  const slices = groupByCategory(rows, direction);

  if (slices.length <= MAX_SLICES) return slices;

  const kept = slices.slice(0, MAX_SLICES - 1);
  const rest = slices.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, s) => sum + s.amount_cents, 0);
  return [...kept, { name: OTHER_BUCKET, amount_cents: restTotal }];
}

export function groupExpensesByCategory(rows: MonthTransaction[]): CategorySlice[] {
  return groupByCategoryCapped(rows, "out");
}

// Ranking simples por categoria (tela Relatórios) — sem o teto de 8
// fatias do donut, porque aqui é lista, não gráfico.
export function groupByCategory(
  rows: MonthTransaction[],
  direction: "in" | "out",
): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.direction !== direction) continue;
    const key = row.category_name ?? "Sem categoria";
    totals.set(key, (totals.get(key) ?? 0) + row.amount_cents);
  }

  return Array.from(totals.entries())
    .map(([name, amount_cents]) => ({ name, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents);
}

export type DailyReportPoint = {
  date: string;
  label: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
};

// Receitas, despesas e saldo líquido de cada dia do mês (não
// acumulado) — série usada pelo gráfico "Evolução do período".
export function dailySeries(rows: MonthTransaction[], start: string, end: string): DailyReportPoint[] {
  const byDate = new Map<string, { income_cents: number; expense_cents: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { income_cents: 0, expense_cents: 0 };
    if (row.direction === "in") entry.income_cents += row.amount_cents;
    else entry.expense_cents += row.amount_cents;
    byDate.set(row.date, entry);
  }

  const points: DailyReportPoint[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    const iso = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(iso) ?? { income_cents: 0, expense_cents: 0 };
    points.push({
      date: iso,
      label: String(cursor.getDate()),
      income_cents: entry.income_cents,
      expense_cents: entry.expense_cents,
      net_cents: entry.income_cents - entry.expense_cents,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

/** Trecho de frase: texto puro ou um valor em dinheiro (que o "ocultar valores" borra). */
export type InsightPart = string | { cents: number };

export type ReportInsight = {
  headline: InsightPart[];
  tone: "positive" | "warning";
  items: {
    parts: InsightPart[];
    tone: "positive" | "warning" | "info";
    /** Ícone explícito (destaques do período); sem ele, o card deduz pela frase. */
    icon?: "best" | "worst" | "top" | "months" | "compare";
  }[];
};

/** Categoria com o valor do mês e o do mês anterior (null = não existia). */
export type CategoryDelta = { name: string; amount_cents: number; prev_cents: number | null };

// Cada categoria do mês, com quanto foi no mês anterior — pra lista
// "vs agosto" do relatório e pras frases do insight.
export function categoryDeltas(
  current: MonthTransaction[],
  previous: MonthTransaction[],
  direction: "in" | "out",
): CategoryDelta[] {
  const prev = new Map(groupByCategory(previous, direction).map((s) => [s.name, s.amount_cents]));
  return groupByCategory(current, direction).map((s) => ({
    name: s.name,
    amount_cents: s.amount_cents,
    prev_cents: prev.get(s.name) ?? null,
  }));
}

const UNCATEGORIZED = "Sem categoria";

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

// Leitura automática do período, comparando com o mês anterior em
// DINHEIRO, não em porcentagem. Porcentagem engana aqui: sobre um mês
// fraco qualquer mês normal vira "+1035%", e sobre saldo negativo a conta
// nem faz sentido ("150% maior" que −$843). Tudo com nome e número de
// verdade — nada de conselho genérico. "Sem categoria" fica de fora: a
// tela já avisa disso no topo.
export function buildReportInsight(input: {
  income: number;
  expense: number;
  balance: number;
  incomePrev: number;
  expensePrev: number;
  balancePrev: number;
  expenseDeltas: CategoryDelta[];
  /** "agosto" */
  prevName: string;
}): ReportInsight {
  const { income, expense, balance, incomePrev, expensePrev, balancePrev, expenseDeltas, prevName } = input;

  const hasPrev = incomePrev !== 0 || expensePrev !== 0;
  const items: ReportInsight["items"] = [];

  let headline: InsightPart[];
  let tone: ReportInsight["tone"];
  const diff = balance - balancePrev;
  if (balance < 0) {
    headline = ["Neste mês saiu mais do que entrou: faltaram ", { cents: -balance }, "."];
    tone = "warning";
  } else if (!hasPrev) {
    headline = ["Sobrou ", { cents: balance }, " neste mês."];
    tone = "positive";
  } else if (diff >= 0) {
    headline = [
      "Bom mês! Sobrou ",
      { cents: balance },
      " — ",
      { cents: diff },
      ` a mais que em ${prevName}${balancePrev < 0 ? ", quando faltou dinheiro" : ""}.`,
    ];
    tone = "positive";
  } else {
    headline = ["Sobrou ", { cents: balance }, ", ", { cents: -diff }, ` a menos que em ${prevName}.`];
    tone = "warning";
  }

  const named = expenseDeltas.filter((d) => d.name !== UNCATEGORIZED);

  if (hasPrev) {
    const incomeDiff = income - incomePrev;
    if (incomeDiff !== 0) {
      items.push({
        parts: ["Entrou ", { cents: Math.abs(incomeDiff) }, ` ${incomeDiff > 0 ? "a mais" : "a menos"} que em ${prevName}.`],
        tone: incomeDiff > 0 ? "positive" : "warning",
      });
    }

    const expenseDiff = expense - expensePrev;
    if (expenseDiff !== 0) {
      // Quem mais puxou a diferença, pra frase dizer o porquê.
      const movers = named
        .filter((d) => d.prev_cents !== null && (expenseDiff > 0 ? d.amount_cents > d.prev_cents : d.amount_cents < d.prev_cents))
        .sort((a, b) => Math.abs(b.amount_cents - (b.prev_cents ?? 0)) - Math.abs(a.amount_cents - (a.prev_cents ?? 0)))
        .slice(0, 2);
      const why: InsightPart[] = [];
      movers.forEach((m, i) => {
        why.push(`${i === 0 ? " — " : ", "}${m.name} ${expenseDiff > 0 ? "+" : "−"}`);
        why.push({ cents: Math.abs(m.amount_cents - (m.prev_cents ?? 0)) });
      });
      items.push({
        parts: ["Saiu ", { cents: Math.abs(expenseDiff) }, ` ${expenseDiff < 0 ? "a menos" : "a mais"}`, ...why, "."],
        tone: expenseDiff < 0 ? "positive" : "warning",
      });
    }

    const same = named.find((d) => d.prev_cents === d.amount_cents && d.amount_cents > 0);
    if (same) {
      items.push({ parts: [`${same.name} ficou igual: `, { cents: same.amount_cents }, " nos dois meses."], tone: "info" });
    }

    const fresh = named.filter((d) => d.prev_cents === null).map((d) => d.name);
    if (fresh.length > 0) {
      items.push({
        parts: [
          fresh.length === 1
            ? `${fresh[0]} apareceu pela primeira vez.`
            : `${listNames(fresh.slice(0, 3))} apareceram pela primeira vez.`,
        ],
        tone: "info",
      });
    }
  } else if (named[0] && expense > 0) {
    const share = Math.round((named[0].amount_cents / expense) * 100);
    items.push({
      parts: [`${named[0].name} foi sua maior despesa: `, { cents: named[0].amount_cents }, ` (${share}%).`],
      tone: "info",
    });
  }

  return { headline, tone, items: items.slice(0, 4) };
}

// Entradas, saídas e saldo de cada MÊS entre `from` e `to` (períodos
// longos). `date` é o dia 1º do mês; `label` vem de quem chama, porque
// depende de o período passar de um ano.
export function monthlySeries(
  rows: MonthTransaction[],
  months: string[],
  labelFor: (month: string) => string,
): DailyReportPoint[] {
  const byMonth = new Map<string, { income_cents: number; expense_cents: number }>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const entry = byMonth.get(key) ?? { income_cents: 0, expense_cents: 0 };
    if (row.direction === "in") entry.income_cents += row.amount_cents;
    else entry.expense_cents += row.amount_cents;
    byMonth.set(key, entry);
  }
  return months.map((month) => {
    const entry = byMonth.get(month) ?? { income_cents: 0, expense_cents: 0 };
    return {
      date: `${month}-01`,
      label: labelFor(month),
      income_cents: entry.income_cents,
      expense_cents: entry.expense_cents,
      net_cents: entry.income_cents - entry.expense_cents,
    };
  });
}

// "Destaques do período": no lugar do insight do mês (que compara com o
// mês anterior), o que marcou um período longo — melhor e pior mês, o
// maior gasto e quantos meses fecharam no azul. No ano, entra também a
// comparação com o mesmo trecho do ano anterior.
export function buildPeriodHighlights(input: {
  /** Uma linha por mês do período, já com o nome ("setembro de 2025"). */
  months: { name: string; income_cents: number; expense_cents: number }[];
  balance: number;
  expense: number;
  expenseByCategory: CategorySlice[];
  /** Só no ano: o que saiu no mesmo trecho do ano anterior. */
  compare?: { expensePrev: number; inLabel: string } | null;
}): ReportInsight {
  const { months, balance, expense, expenseByCategory, compare } = input;
  const count = Math.max(1, months.length);
  const avg = Math.round(balance / count);

  let headline: InsightPart[];
  let tone: ReportInsight["tone"];
  if (balance < 0) {
    headline =
      count > 1
        ? [`Em ${count} meses saiu mais do que entrou: faltaram `, { cents: -balance }, " (", { cents: -avg }, " por mês)."]
        : ["Saiu mais do que entrou: faltaram ", { cents: -balance }, "."];
    tone = "warning";
  } else {
    headline =
      count > 1
        ? [`Em ${count} meses sobrou `, { cents: balance }, " — em média ", { cents: avg }, " por mês."]
        : ["Sobrou ", { cents: balance }, " no período."];
    tone = "positive";
  }

  const items: ReportInsight["items"] = [];

  if (compare && (compare.expensePrev !== 0 || expense !== 0)) {
    const diff = expense - compare.expensePrev;
    if (diff !== 0) {
      items.push({
        parts: ["Saiu ", { cents: Math.abs(diff) }, ` ${diff < 0 ? "a menos" : "a mais"} que ${compare.inLabel}.`],
        tone: diff < 0 ? "positive" : "warning",
        icon: "compare",
      });
    }
  }

  // Só meses com movimento: um mês vazio no meio não é "o melhor" nem "no azul".
  const active = months.filter((m) => m.income_cents !== 0 || m.expense_cents !== 0);
  if (active.length >= 2) {
    const net = (m: (typeof active)[number]) => m.income_cents - m.expense_cents;
    const best = active.reduce((a, b) => (net(b) > net(a) ? b : a));
    const worst = active.reduce((a, b) => (net(b) < net(a) ? b : a));
    if (net(best) > 0) {
      items.push({ parts: [`Melhor mês: ${best.name}, sobraram `, { cents: net(best) }, "."], tone: "positive", icon: "best" });
    }
    if (worst !== best) {
      items.push(
        net(worst) < 0
          ? { parts: [`Mês mais apertado: ${worst.name}, faltaram `, { cents: -net(worst) }, "."], tone: "warning", icon: "worst" }
          : { parts: [`Mês mais apertado: ${worst.name}, sobraram só `, { cents: net(worst) }, "."], tone: "info", icon: "worst" },
      );
    }
  }

  const top = expenseByCategory.find((c) => c.name !== UNCATEGORIZED);
  if (top && expense > 0) {
    const share = Math.round((top.amount_cents / expense) * 100);
    items.push({
      parts:
        count > 1
          ? [`${top.name} é o maior gasto: ${share}% de tudo que saiu (`, { cents: Math.round(top.amount_cents / count) }, " por mês)."]
          : [`${top.name} é o maior gasto: ${share}% de tudo que saiu.`],
      tone: "info",
      icon: "top",
    });
  }

  if (active.length >= 2) {
    const blue = active.filter((m) => m.income_cents >= m.expense_cents).length;
    items.push({
      parts: [`${blue} de ${active.length} meses fecharam no azul.`],
      tone: blue * 2 >= active.length ? "positive" : "warning",
      icon: "months",
    });
  }

  return { headline, tone, items: items.slice(0, 4) };
}
