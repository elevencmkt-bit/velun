// Rodar: npx tsx scripts/check-category-insight.ts
import assert from "node:assert/strict";
import { categoryInsight } from "../src/lib/category-insight";

const rows = [
  { date: "2026-09-28", description: "DoorDash", amount_cents: 13642 },
  { date: "2026-09-24", description: "DoorDash", amount_cents: 1785 },
  { date: "2026-09-19", description: "Burger King", amount_cents: 4145 },
  { date: "2026-09-15", description: "Yami Buffet", amount_cents: 3890 },
];
const i = categoryInsight(rows);
assert.equal(i.top?.amount_cents, 13642);
assert.equal(i.heavy?.description, "DoorDash");
assert.equal(i.heavy?.count, 2);
assert.ok(i.heavy!.share > 0.6);

assert.equal(categoryInsight([]).top, null);
assert.equal(categoryInsight([rows[0]]).top, null, "um só: nada a destacar");
assert.equal(
  categoryInsight([
    { date: "a", description: "A", amount_cents: 100 },
    { date: "b", description: "B", amount_cents: 100 },
    { date: "c", description: "C", amount_cents: 100 },
  ]).heavy,
  null,
  "ninguém concentra",
);
console.log("check-category-insight: ok");
