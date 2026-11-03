// Rodar: npx tsx scripts/check-free-this-week.ts
// "Livre esta semana" (valores inventados).
import assert from "node:assert/strict";
import { computeFreeThisWeek } from "../src/lib/free-this-week";

const est = new Map<string, number>();
for (let d = 2; d <= 30; d++) est.set(`2026-11-${String(d).padStart(2, "0")}`, 1000); // $10/dia

// Segunda, 2/11. Salário garantido dia 13; freela variável dia 6.
const base = {
  today: "2026-11-02",
  availableCents: 250000,
  estimateByDate: est,
  floorCents: 100000,
  overdueOutCents: 0,
};
const r = computeFreeThisWeek({
  ...base,
  events: [
    { date: "2026-11-04", description: "Aluguel", direction: "out", amount_cents: 80000 },
    { date: "2026-11-06", description: "Freela", direction: "in", amount_cents: 300000, certainty: "variable" },
    { date: "2026-11-13", description: "Salário", direction: "in", amount_cents: 400000, certainty: "guaranteed" },
    { date: "2026-11-14", description: "Escola", direction: "out", amount_cents: 28200 },
  ],
});
assert.equal(r.until, "2026-11-12", "até a véspera da próxima entrada garantida");
assert.deepEqual(r.nextIncome, { description: "Salário", date: "2026-11-13", amountCents: 400000 });
assert.equal(r.incomeCents, 0, "a variável não conta antes de cair");
assert.equal(r.outCents, 80000);
assert.equal(r.estimatedCents, 11 * 1000, "estimado de 2 a 12/11");
assert.equal(r.freeCents, 250000 - 80000 - 11000 - 100000);
assert.equal(r.state, "free");

// Garantida em 3 dias: o prazo vai até 7 dias e ela entra na conta.
const soon = computeFreeThisWeek({
  ...base,
  events: [{ date: "2026-11-05", description: "Salário", direction: "in", amount_cents: 50000, certainty: "guaranteed" }],
});
assert.equal(soon.until, "2026-11-08", "mínimo de 7 dias (hoje e os 6 seguintes)");
assert.equal(soon.incomeCents, 50000);

// Sem entrada garantida à vista: 30 dias, e falta pro piso.
const none = computeFreeThisWeek({
  ...base,
  availableCents: 120000,
  overdueOutCents: 5000,
  events: [{ date: "2026-11-06", description: "Freela", direction: "in", amount_cents: 300000, certainty: null }],
});
assert.equal(none.until, "2026-12-01");
assert.equal(none.nextIncome, null);
assert.equal(none.state, "short");
assert.equal(none.freeCents, 120000 - 5000 - 29000 - 100000);

// Entre zero e $50: só essenciais.
const ess = computeFreeThisWeek({ ...base, estimateByDate: new Map(), availableCents: 103000, events: [] });
assert.equal(ess.freeCents, 3000);
assert.equal(ess.state, "essentials");

console.log("check-free-this-week: ok");
