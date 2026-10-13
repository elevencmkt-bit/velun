// Rodar: npx tsx scripts/check-duplicates.ts
import assert from "node:assert/strict";
import { duplicateCounter } from "../src/lib/import/duplicates";

// Conta já tem 1 taxa e 2 saques iguais no dia; o extrato traz 2 taxas e 3 saques.
const isDup = duplicateCounter(["taxa", "saque", "saque"]);
assert.deepEqual(
  ["taxa", "taxa", "saque", "saque", "saque", "cafe"].map(isDup),
  [true, false, true, true, false, false],
);
console.log("check-duplicates: ok");
