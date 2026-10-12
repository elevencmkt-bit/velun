// Confere as frases do Insight Velun (Relatórios) com os números de setembro x agosto.
import assert from "node:assert/strict";
import { buildReportInsight, categoryDeltas, type InsightPart, type MonthTransaction } from "../src/lib/reports";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const text = (parts: InsightPart[]) => parts.map((p) => (typeof p === "string" ? p : fmt(p.cents))).join("");
let n = 0;
const tx = (cat: string | null, cents: number, direction: "in" | "out" = "out"): MonthTransaction => ({
  id: String(n++), account_id: "a", date: "2026-09-01", amount_cents: cents, direction,
  description: "x", transfer_group_id: null, category_name: cat, account_name: "A",
});

const sep = [tx(null, 294779), tx("Educação", 56400), tx("Restaurante", 36277), tx("Assinaturas", 20767), tx("Trabalho", 18100), tx("Compras", 7291), tx("Mercado", 6055), tx("Transporte", 1515)];
const aug = [tx("Educação", 56400), tx("Mercado", 29793), tx("Restaurante", 23537), tx(null, 7278), tx("Assinaturas", 4745), tx("Transporte", 4590)];

const deltas = categoryDeltas(sep, aug, "out");
assert.equal(deltas[0].name, "Sem categoria");
assert.equal(deltas.find((d) => d.name === "Trabalho")!.prev_cents, null);
assert.equal(deltas.find((d) => d.name === "Restaurante")!.prev_cents, 23537);

const insight = buildReportInsight({
  income: 617158, expense: 441184, balance: 175974,
  incomePrev: 42032, expensePrev: 126343, balancePrev: -84311,
  expenseDeltas: deltas, prevName: "agosto",
});
assert.equal(insight.tone, "positive");
assert.equal(text(insight.headline), "Bom mês! Sobrou $1759.74 — $2602.85 a mais que em agosto, quando faltou dinheiro.");
const lines = insight.items.map((i) => text(i.parts));
assert.deepEqual(lines, [
  "Entrou $5751.26 a mais que em agosto.",
  "Saiu $3148.41 a mais — Assinaturas +$160.22, Restaurante +$127.40.",
  "Educação ficou igual: $564.00 nos dois meses.",
  "Trabalho e Compras apareceram pela primeira vez.",
]);

// Mês ruim.
const bad = buildReportInsight({ income: 42032, expense: 126343, balance: -84311, incomePrev: 0, expensePrev: 0, balancePrev: 0, expenseDeltas: categoryDeltas(aug, [], "out"), prevName: "julho" });
assert.equal(bad.tone, "warning");
assert.equal(text(bad.headline), "Neste mês saiu mais do que entrou: faltaram $843.11.");
assert.equal(text(bad.items[0].parts), "Educação foi sua maior despesa: $564.00 (45%).");

console.log("check-report-insight: ok");
