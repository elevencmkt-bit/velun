// Rodar: npx tsx scripts/check-subcategories.ts
import assert from "node:assert/strict";
import { categoryLabel, familyIds, orderWithChildren, resolveJoinedCategory, topOf } from "../src/lib/subcategories";
import { NO_SUBCATEGORY, subcategoryBreakdown, categoryDeltas, type MonthTransaction } from "../src/lib/reports";

// Join do banco: sub traz a principal junto.
assert.deepEqual(resolveJoinedCategory({ name: "Gasolina", is_transfer: false, parent: { name: "Transporte", is_transfer: false } }), {
  name: "Transporte",
  sub: "Gasolina",
  isTransfer: false,
});
assert.deepEqual(resolveJoinedCategory([{ name: "Mercado", parent: null }]), { name: "Mercado", sub: null, isTransfer: false });
assert.deepEqual(resolveJoinedCategory(null), { name: null, sub: null, isTransfer: false });
assert.equal(resolveJoinedCategory({ name: "Transferência", is_transfer: true }).isTransfer, true);
assert.equal(categoryLabel("Transporte", "Gasolina"), "Transporte · Gasolina");
assert.equal(categoryLabel("Transporte", null), "Transporte");
assert.equal(categoryLabel(null, null), null);

const cats = [
  { id: "t", name: "Transporte" },
  { id: "m", name: "Mercado" },
  { id: "g", name: "Gasolina", parent_id: "t" },
  { id: "u", name: "Uber", parent_id: "t" },
  { id: "x", name: "Órfã", parent_id: "sumiu" },
];
assert.deepEqual(
  orderWithChildren(cats).map((c) => `${c.depth}:${c.name}`),
  ["0:Transporte", "1:Gasolina", "1:Uber", "0:Mercado", "0:Órfã"],
  "sub logo abaixo da principal; sub sem principal na lista vira principal",
);
assert.deepEqual(familyIds(cats, "t"), ["t", "g", "u"]);
assert.deepEqual(familyIds(cats, "m"), ["m"]);
assert.equal(topOf(cats, "g")?.name, "Transporte");
assert.equal(topOf(cats, "t")?.name, "Transporte");
assert.equal(topOf(cats, ""), null);

// Relatório: a categoria soma as subs; a divisão fecha com o total.
const tx = (cents: number, name: string | null, sub: string | null = null, dir: "in" | "out" = "out"): MonthTransaction => ({
  id: `${name}-${sub}-${cents}`,
  account_id: "a",
  date: "2026-10-01",
  amount_cents: cents,
  direction: dir,
  description: "x",
  transfer_group_id: null,
  category_name: name,
  subcategory_name: sub,
  account_name: "Conta",
});
const rows = [tx(4000, "Transporte", "Gasolina"), tx(1000, "Transporte", "Uber"), tx(500, "Transporte"), tx(3000, "Mercado")];
assert.deepEqual(
  categoryDeltas(rows, [], "out").map((d) => [d.name, d.amount_cents]),
  [["Transporte", 5500], ["Mercado", 3000]],
);
const subs = subcategoryBreakdown(rows, "out");
assert.deepEqual(subs.get("Transporte"), [
  { name: "Gasolina", amount_cents: 4000 },
  { name: "Uber", amount_cents: 1000 },
  { name: NO_SUBCATEGORY, amount_cents: 500 },
]);
assert.equal(subs.has("Mercado"), false, "sem sub, sem divisão");
console.log("check-subcategories: ok");
