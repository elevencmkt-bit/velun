// Rodar: npx tsx scripts/check-recurrence-frequency.ts
import assert from "node:assert/strict";
import { describeSchedule, generateOccurrenceDates, PER_MONTH, usesDayOfMonth } from "../src/lib/recurrence";

// Trimestral: dia 15, a partir de outubro.
assert.deepEqual(
  generateOccurrenceDates({ frequency: "quarterly", startsOn: "2026-10-15", dayOfMonth: 15, endsOn: null, count: 4, from: "2026-10-01" }),
  ["2026-10-15", "2027-01-15", "2027-04-15", "2027-07-15"],
);
// Mantém o compasso a partir do início, mesmo vendo de mais tarde.
assert.deepEqual(
  generateOccurrenceDates({ frequency: "quarterly", startsOn: "2026-10-15", dayOfMonth: 15, endsOn: null, count: 2, from: "2027-02-01" }),
  ["2027-04-15", "2027-07-15"],
);
// Semestral com dia 31: cai no último dia do mês.
assert.deepEqual(
  generateOccurrenceDates({ frequency: "semiannual", startsOn: "2026-08-31", dayOfMonth: 31, endsOn: null, count: 3, from: "2026-08-01" }),
  ["2026-08-31", "2027-02-28", "2027-08-31"],
);
// Termina em.
assert.deepEqual(
  generateOccurrenceDates({ frequency: "semiannual", startsOn: "2026-01-10", dayOfMonth: 10, endsOn: "2026-12-31", count: 5, from: "2026-01-01" }),
  ["2026-01-10", "2026-07-10"],
);
// Mensal continua igual.
assert.deepEqual(
  generateOccurrenceDates({ frequency: "monthly", startsOn: "2026-10-21", dayOfMonth: 21, endsOn: null, count: 3, from: "2026-10-17" }),
  ["2026-10-21", "2026-11-21", "2026-12-21"],
);

assert.equal(describeSchedule({ frequency: "quarterly", startsOn: "2026-10-15", dayOfMonth: 15 }), "a cada 3 meses, dia 15");
assert.equal(describeSchedule({ frequency: "semiannual", startsOn: "2026-10-15", dayOfMonth: 15 }), "a cada 6 meses, dia 15");
assert.equal(usesDayOfMonth("quarterly"), true);
assert.equal(usesDayOfMonth("weekly"), false);
assert.equal(Math.round(30000 * PER_MONTH.quarterly), 10000);
assert.equal(Math.round(60000 * PER_MONTH.semiannual), 10000);

console.log("check-recurrence-frequency: ok");
