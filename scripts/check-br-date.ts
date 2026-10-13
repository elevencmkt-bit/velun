// Rodar: npx tsx scripts/check-br-date.ts
import assert from "node:assert/strict";
import { brToIso, isoToBr, maskBr } from "../src/lib/br-date";

assert.equal(isoToBr("2026-10-13"), "13/10/2026");
assert.equal(isoToBr(""), "");
assert.equal(maskBr("1"), "1");
assert.equal(maskBr("1310"), "13/10");
assert.equal(maskBr("13102026"), "13/10/2026");
assert.equal(maskBr("13/10/2026xx99"), "13/10/2026");
assert.equal(brToIso("13/10/2026"), "2026-10-13");
assert.equal(brToIso("31/02/2026"), null, "31 de fevereiro não existe");
assert.equal(brToIso("29/02/2028"), "2028-02-29", "bissexto");
assert.equal(brToIso("29/02/2026"), null);
assert.equal(brToIso("13/13/2026"), null);
assert.equal(brToIso("13/10/26"), null, "ano com 4 dígitos");
console.log("check-br-date: ok");
