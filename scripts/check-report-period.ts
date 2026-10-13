// Rodar: npx tsx scripts/check-report-period.ts
import assert from "node:assert/strict";
import { buildPeriod, monthsCovered } from "../src/lib/report-pdf/period";

const sep = buildPeriod("2026-09-01", "2026-09-30");
assert.equal(sep.kind, "month");
assert.equal(sep.label, "Setembro de 2026");
assert.deepEqual(sep.prev, { from: "2026-08-01", to: "2026-08-31", label: "agosto" });
assert.equal(sep.multiMonth, false);

const jan = buildPeriod("2026-01-01", "2026-01-31");
assert.deepEqual(jan.prev, { from: "2025-12-01", to: "2025-12-31", label: "dezembro" });

const ytd = buildPeriod("2026-01-01", "2026-09-30");
assert.equal(ytd.kind, "year");
assert.equal(ytd.label, "Janeiro a setembro de 2026");
assert.deepEqual(ytd.prev, { from: "2025-01-01", to: "2025-09-30", label: "mesmo período de 2025" });
assert.equal(ytd.months.length, 9);
assert.equal(buildPeriod("2026-01-01", "2026-12-31").label, "Ano de 2026");

const custom = buildPeriod("2026-03-10", "2026-03-19");
assert.equal(custom.kind, "custom");
assert.equal(custom.label, "10/03/2026 a 19/03/2026");
assert.deepEqual(custom.prev, { from: "2026-02-28", to: "2026-03-09", label: "período anterior" });

assert.deepEqual(monthsCovered("2025-11-15", "2026-02-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
assert.equal(buildPeriod("2026-02-01", "2026-01-01").from, "2026-01-01", "datas invertidas são trocadas");
console.log("check-report-period: ok");
