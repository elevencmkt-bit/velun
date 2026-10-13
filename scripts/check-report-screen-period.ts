// Rodar: npx tsx scripts/check-report-screen-period.ts
import assert from "node:assert/strict";
import {
  axisMonthLabel,
  effectiveBounds,
  fetchBounds,
  parseScreenPeriod,
  selectorLabel,
  yearComparison,
} from "../src/lib/report-screen-period";
import { buildPeriodHighlights, monthlySeries, type MonthTransaction } from "../src/lib/reports";

const today = "2026-10-13";

// URL → período. De/até ganha de tudo; depois ano; depois todo o período; senão, mês.
assert.deepEqual(parseScreenPeriod({}, today), { kind: "month", year: 2026, monthIndex: 9 });
assert.deepEqual(parseScreenPeriod({ month: "2026-09" }, today), { kind: "month", year: 2026, monthIndex: 8 });
assert.deepEqual(parseScreenPeriod({ year: "2025" }, today), { kind: "year", year: 2025 });
assert.deepEqual(parseScreenPeriod({ all: "1", month: "2026-09" }, today), { kind: "all" });
assert.deepEqual(parseScreenPeriod({ from: "2026-10-01", to: "2026-03-01", year: "2025" }, today), {
  kind: "range",
  from: "2026-03-01",
  to: "2026-10-01",
});
assert.equal(parseScreenPeriod({ from: "2026-02-31", to: "2026-03-01" }, today).kind, "month", "data que não existe é ignorada");
assert.equal(parseScreenPeriod({ month: "2026-13" }, today).kind, "month");

assert.deepEqual(fetchBounds({ kind: "month", year: 2026, monthIndex: 1 }), { from: "2026-02-01", to: "2026-02-28" });
assert.deepEqual(fetchBounds({ kind: "year", year: 2026 }), { from: "2026-01-01", to: "2026-12-31" });

// Ano em curso, realizado: vai até hoje. A vencer: o ano todo. Ano passado: inteiro.
const y26 = { kind: "year", year: 2026 } as const;
const none = { firstDate: null, lastDate: null };
assert.deepEqual(effectiveBounds(y26, { today, realized: true, ...none }), { from: "2026-01-01", to: "2026-10-13" });
assert.deepEqual(effectiveBounds(y26, { today, realized: false, ...none }), { from: "2026-01-01", to: "2026-12-31" });
assert.deepEqual(effectiveBounds({ kind: "year", year: 2025 }, { today, realized: true, ...none }), {
  from: "2025-01-01",
  to: "2025-12-31",
});
// Todo o período: do primeiro lançamento até hoje (ou até o último pendente).
assert.deepEqual(
  effectiveBounds({ kind: "all" }, { today, realized: true, firstDate: "2024-07-03", lastDate: "2026-10-10" }),
  { from: "2024-07-03", to: "2026-10-13" },
);
assert.deepEqual(
  effectiveBounds({ kind: "all" }, { today, realized: false, firstDate: "2026-09-20", lastDate: "2027-01-05" }),
  { from: "2026-09-20", to: "2027-01-05" },
);

// Comparação do ano: mesmo trecho do ano anterior; 29/02 vira 28/02.
assert.deepEqual(yearComparison(2026, "2026-10-13"), {
  from: "2025-01-01",
  to: "2025-10-13",
  label: "2025",
  inLabel: "no mesmo período de 2025",
});
assert.equal(yearComparison(2025, "2025-12-31").inLabel, "em 2024");
assert.equal(yearComparison(2028, "2028-02-29").to, "2027-02-28");

assert.equal(selectorLabel({ kind: "year", year: 2026 }), "Ano de 2026");
assert.equal(selectorLabel({ kind: "all" }), "Todo o período");
assert.equal(selectorLabel({ kind: "range", from: "2026-03-01", to: "2026-10-13" }), "01/03/26 – 13/10/26");
assert.equal(axisMonthLabel("2025-09", true), "set/25");
assert.equal(axisMonthLabel("2025-09", false), "set");

// Série mês a mês: inclui meses vazios no meio.
const tx = (date: string, cents: number, direction: "in" | "out", category: string | null = null): MonthTransaction => ({
  id: `${date}-${cents}`,
  account_id: "a",
  date,
  amount_cents: cents,
  direction,
  description: "x",
  transfer_group_id: null,
  category_name: category,
  account_name: "Conta",
});
const rows = [
  tx("2026-01-05", 500000, "in"),
  tx("2026-01-10", 300000, "out", "Moradia"),
  tx("2026-03-02", 400000, "in"),
  tx("2026-03-20", 450000, "out", "Mercado"),
];
const series = monthlySeries(rows, ["2026-01", "2026-02", "2026-03"], (m) => m);
assert.deepEqual(
  series.map((p) => [p.date, p.income_cents, p.expense_cents, p.net_cents]),
  [
    ["2026-01-01", 500000, 300000, 200000],
    ["2026-02-01", 0, 0, 0],
    ["2026-03-01", 400000, 450000, -50000],
  ],
);

// Destaques: melhor e pior mês só entre meses com movimento.
const h = buildPeriodHighlights({
  months: series.map((p) => ({ name: p.label, income_cents: p.income_cents, expense_cents: p.expense_cents })),
  balance: 150000,
  expense: 750000,
  expenseByCategory: [
    { name: "Sem categoria", amount_cents: 800000 },
    { name: "Mercado", amount_cents: 450000 },
  ],
});
assert.equal(h.tone, "positive");
assert.deepEqual(h.headline, ["Em 3 meses sobrou ", { cents: 150000 }, " — em média ", { cents: 50000 }, " por mês."]);
assert.deepEqual(h.items.map((i) => i.icon), ["best", "worst", "top", "months"]);
assert.deepEqual(h.items[0].parts, ["Melhor mês: 2026-01, sobraram ", { cents: 200000 }, "."]);
assert.deepEqual(h.items[1].parts, ["Mês mais apertado: 2026-03, faltaram ", { cents: 50000 }, "."]);
assert.equal(h.items[2].parts[0], "Mercado é o maior gasto: 60% de tudo que saiu (", "Sem categoria fica de fora");
assert.deepEqual(h.items[3].parts, ["1 de 2 meses fecharam no azul."]);

// No ano, a comparação com o ano anterior vem primeiro.
const y = buildPeriodHighlights({
  months: series.map((p) => ({ name: p.label, income_cents: p.income_cents, expense_cents: p.expense_cents })),
  balance: 150000,
  expense: 750000,
  expenseByCategory: [],
  compare: { expensePrev: 900000, inLabel: "no mesmo período de 2025" },
});
assert.deepEqual(y.items[0], {
  parts: ["Saiu ", { cents: 150000 }, " a menos que no mesmo período de 2025."],
  tone: "positive",
  icon: "compare",
});

// Saldo negativo vira aviso.
assert.equal(buildPeriodHighlights({ months: [], balance: -1000, expense: 1000, expenseByCategory: [] }).tone, "warning");

console.log("check-report-screen-period: ok");
