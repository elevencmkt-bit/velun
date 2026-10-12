// Categoria por estabelecimento: quem vai junto e quem fica.
// Rodar: npx tsx scripts/check-merchant-categories.ts
import assert from "node:assert/strict";
import {
  learnedCategoryFor,
  merchantKey,
  sameMerchantRows,
} from "../src/lib/merchant-categories";

// Mesma loja, textos diferentes do banco → mesma chave.
assert.equal(merchantKey("Compra PUBLIX #2022"), merchantKey("Compra PUBLIX SUPER MAR 2435"));
assert.equal(
  merchantKey("PIN Purchase Publix Super M 5411 Orlando FL 9889"),
  merchantKey("Compra PUBLIX #2022"),
);
assert.notEqual(merchantKey("Compra PUBLIX #2022"), merchantKey("Compra WM SUPERCENTER #1220"));

const rows = [
  { id: "a", bankDescription: "Compra PUBLIX #2022", direction: "out" as const, locked: false },
  { id: "b", bankDescription: "Compra PUBLIX SUPER MAR 2435", direction: "out" as const, locked: false },
  { id: "c", bankDescription: "Compra PUBLIX #2022", direction: "out" as const, locked: true },
  { id: "d", bankDescription: "Compra PUBLIX #2022", direction: "in" as const, locked: false },
  { id: "e", bankDescription: "Compra WM SUPERCENTER #1220", direction: "out" as const, locked: false },
];

assert.deepEqual(
  sameMerchantRows(rows, rows[0]).map((r) => r.id),
  ["b"],
  "vai só o Publix de saída que não foi escolhido na mão",
);

const learned = new Map([[`out|${merchantKey("Compra PUBLIX #2022")}`, "cat-mercado"]]);
assert.equal(learnedCategoryFor(learned, "Compra PUBLIX SUPER MAR 2435", "out"), "cat-mercado");
assert.equal(learnedCategoryFor(learned, "Compra PUBLIX #2022", "in"), null, "reembolso não herda");
assert.equal(learnedCategoryFor(learned, "Compra WM SUPERCENTER #1220", "out"), null);

console.log("check-merchant-categories: ok");
