// Rodar: npx tsx scripts/check-cash-flow-estimates.ts
// Gastos estimados pelos limites das Metas (valores inventados).
import assert from "node:assert/strict";
import { buildSeries, cumulative, estimateSpending, estimatedBetween } from "../src/lib/cash-flow-estimates";

// 3 de novembro, 30 dias: o resto de novembro (28 dias, do dia 3 ao 30) e
// os 3 primeiros de dezembro.
const r = estimateSpending({
  limits: [
    { categoryId: "mercado", name: "Mercado", limitCents: 75000 },
    { categoryId: "transporte", name: "Transporte", limitCents: 63000 },
  ],
  // Mercado: já gastou $465 em novembro.
  spentThisMonth: new Map([["mercado", 46500]]),
  // Transporte: a parcela do carro ($480) prevista em novembro e em dezembro.
  planned: new Map([
    ["transporte|2026-11", 48000],
    ["transporte|2026-12", 48000],
  ]),
  today: "2026-11-03",
  horizonDays: 30,
});

const mercado = r.categories.find((c) => c.categoryId === "mercado")!;
assert.equal(mercado.remainingThisMonthCents, 28500, "$750 − $465 gastos = $285 pro resto do mês");
assert.equal(mercado.nextMonthCents, 75000, "mês seguinte: limite cheio");
// Novembro inteiro do resto ($285) + 3 dias de dezembro ($750 ÷ 31 × 3 ≈ $72.58).
assert.equal(mercado.totalCents, 28500 + Math.round((75000 * 3) / 31));

const transporte = r.categories.find((c) => c.categoryId === "transporte")!;
assert.equal(transporte.remainingThisMonthCents, 15000, "carro $480 já lançado: estima só $150 de gasolina");
assert.equal(transporte.nextMonthCents, 15000);

// Espalhado igual por dia, e a soma bate no centavo.
const nov = estimatedBetween(r.byDate, "2026-11-03", "2026-11-30");
assert.equal(nov, 28500 + 15000);
const day3 = r.byDate.get("2026-11-03")!;
const day30 = r.byDate.get("2026-11-30")!;
assert.ok(Math.abs(day3 - day30) <= 2, "mesmo valor por dia (diferença só de arredondamento)");
assert.equal(r.byDate.has("2026-11-02"), false, "antes de hoje não estima nada");
assert.equal(r.byDate.has("2026-12-04"), false, "depois do horizonte também não");
assert.equal(r.totalCents, [...r.byDate.values()].reduce((a, b) => a + b, 0));

// Acumulado dia a dia, pra somar no saldo projetado.
const dates = ["2026-11-03", "2026-11-04", "2026-11-05"];
const acc = cumulative(dates, r.byDate);
assert.equal(acc[2], ["2026-11-03", "2026-11-04", "2026-11-05"].reduce((n, d) => n + (r.byDate.get(d) ?? 0), 0));

// Já gastou mais que o limite: estimado zero, nunca negativo.
const over = estimateSpending({
  limits: [{ categoryId: "lazer", name: "Lazer", limitCents: 10000 }],
  spentThisMonth: new Map([["lazer", 15000]]),
  planned: new Map(),
  today: "2026-11-20",
  horizonDays: 5,
});
assert.equal(over.totalCents, 0);
assert.equal(over.categories[0].remainingThisMonthCents, 0);

// A série da tela: lançado − estimado acumulado − atrasados; o piso conta os dias abaixo.
const pts: { date: string; balance_cents: number; reference_cents?: number }[] = [
  { date: "2026-11-03", balance_cents: 100000 },
  { date: "2026-11-04", balance_cents: 100000 },
  { date: "2026-11-05", balance_cents: 40000 },
];
const s = buildSeries(pts, {
  estimateByDate: new Map([
    ["2026-11-03", 1000],
    ["2026-11-04", 1000],
    ["2026-11-05", 1000],
  ]),
  overdueNetOutCents: 5000,
  floorCents: 60000,
});
assert.deepEqual(s.series.map((p) => p.balance_cents), [94000, 93000, 32000]);
assert.deepEqual(s.series.map((p) => p.reference_cents), [100000, 100000, 40000], "linha só com o lançado");
assert.equal(s.belowFloorDays, 1);
assert.equal(s.negativeDays, 0);
assert.equal(s.lowest.date, "2026-11-05");
assert.equal(s.referenceFinal, 40000);
// Sem estimados nem atrasados: a mesma série, sem linha de comparação.
const plain = buildSeries(pts, {});
assert.deepEqual(plain.series.map((p) => p.balance_cents), [100000, 100000, 40000]);
assert.equal(plain.series[0].reference_cents, undefined);
assert.equal(plain.belowFloorDays, 0, "piso zerado: não conta");

console.log("check-cash-flow-estimates: ok");
