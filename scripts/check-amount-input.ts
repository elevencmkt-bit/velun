// Rodar: npx tsx scripts/check-amount-input.ts
import assert from "node:assert/strict";
import { amountToCents, normalizeAmount } from "../src/lib/amount-input";
import { parseToCents } from "../src/lib/money";

assert.equal(normalizeAmount("85,15"), "85.15");
assert.equal(normalizeAmount("85.15"), "85.15");
assert.equal(normalizeAmount("1.800,00"), "1800.00");
assert.equal(normalizeAmount("1,800.00"), "1800.00");
assert.equal(normalizeAmount("1800"), "1800");
assert.equal(normalizeAmount("$ 3.750"), "3750", "ponto com 3 dígitos é milhar");
assert.equal(normalizeAmount(",5"), "0.5");
assert.equal(amountToCents("85,15"), 8515);
assert.equal(amountToCents("0,06"), 6);
assert.equal(amountToCents(""), 0);
assert.equal(parseToCents("85,15"), 8515, "servidor entende vírgula");
assert.equal(parseToCents("-320,50"), -32050, "saldo inicial negativo");
assert.equal(parseToCents("1,800.00"), 180000);
assert.throws(() => parseToCents("abc"));
console.log("check-amount-input: ok");
