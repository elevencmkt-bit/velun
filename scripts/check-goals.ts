// Rodar: npx tsx scripts/check-goals.ts
import assert from "node:assert/strict";
import { debtPace, elapsedFraction, monthEnds, monthsUntil, savePace } from "../src/lib/goal-math";

// Outubro de 2026 até julho de 2027: 9 meses (o do mockup).
assert.equal(monthsUntil("2026-10-13", "2027-07-31"), 9);
assert.equal(monthsUntil("2026-10-13", "2026-10-31"), 1, "no mês da data: 1");
assert.equal(monthsUntil("2026-10-13", "2026-01-31"), 1, "data passada: 1, não negativo");

assert.equal(elapsedFraction("2026-01-01", "2026-01-11", "2026-01-06"), 0.5);
assert.equal(elapsedFraction("2026-01-01", "2026-01-11", "2025-12-01"), 0);
assert.equal(elapsedFraction("2026-01-01", "2026-01-01", "2026-01-01"), 1);

// Juntar $5.000 até jul/27, $2.150 guardados: faltam $2.850 em 9 meses.
const s = savePace({ startCents: 0, savedCents: 215000, targetCents: 500000, createdOn: "2026-06-01", targetDate: "2027-07-31", today: "2026-10-13" });
assert.equal(s.monthsLeft, 9);
assert.equal(s.perMonthCents, 31667);
assert.equal(s.pace, "on_track");
const behind = savePace({ startCents: 0, savedCents: 10000, targetCents: 500000, createdOn: "2026-01-01", targetDate: "2026-12-31", today: "2026-10-13" });
assert.equal(behind.pace, "behind");
assert.equal(savePace({ startCents: 0, savedCents: 500000, targetCents: 500000, createdOn: "2026-01-01", targetDate: null, today: "2026-10-13" }).pace, "done");
assert.equal(savePace({ startCents: 0, savedCents: 1, targetCents: 500000, createdOn: "2026-01-01", targetDate: null, today: "2026-10-13" }).perMonthCents, null, "sem data, sem conta por mês");

// Dívida de $3.600 em jul, $2.140 em meados de out, zerar até mar/27: no ritmo.
const d = debtPace({ startCents: 360000, remainingCents: 214000, createdOn: "2026-07-01", targetDate: "2027-03-31", today: "2026-10-13" });
assert.equal(d.pace, "on_track");
assert.equal(d.monthsLeft, 5);
assert.equal(d.perMonthCents, 42800);
// Mesma dívida com prazo em dez: 57% do tempo passou e só 41% foi pago.
assert.equal(debtPace({ startCents: 360000, remainingCents: 214000, createdOn: "2026-07-01", targetDate: "2026-12-31", today: "2026-10-13" }).pace, "behind");
assert.equal(debtPace({ startCents: 360000, remainingCents: 350000, createdOn: "2026-07-01", targetDate: "2026-12-31", today: "2026-10-13" }).pace, "behind");
assert.equal(debtPace({ startCents: 360000, remainingCents: 0, createdOn: "2026-07-01", targetDate: null, today: "2026-10-13" }).pace, "done");

assert.deepEqual(monthEnds("2026-08-15", "2026-10-13"), ["2026-08-31", "2026-09-30", "2026-10-13"]);
assert.deepEqual(monthEnds("2026-10-02", "2026-10-13"), ["2026-10-13"]);
assert.deepEqual(monthEnds("2026-12-20", "2027-01-05"), ["2026-12-31", "2027-01-05"]);
console.log("check-goals: ok");
