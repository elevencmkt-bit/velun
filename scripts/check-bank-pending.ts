// Rodar: npx tsx scripts/check-bank-pending.ts
// Dados inventados.
import assert from "node:assert/strict";
import { isKnownPending, matchPending, readPending, sameMerchant, type PendingCandidate } from "../src/lib/import/bank-pending";

// Nome e data do pendente: o código do banco (MMDDHHMM + cartão) sai do nome e vira a data.
assert.deepEqual(readPending("PIE PLACE 10292109 3145", "2026-11-02"), { description: "PIE PLACE", date: "2026-10-29" });
assert.deepEqual(readPending("+CAFE NOVO MA 10301326 3145", "2026-11-02"), { description: "CAFE NOVO MA", date: "2026-10-30" });
assert.deepEqual(readPending("SQ *ARENA LANCHE 11011842 3145", "2026-11-02"), { description: "ARENA LANCHE", date: "2026-11-01" });
assert.deepEqual(readPending("DD *DOORDASH CV 10311816 3145", "2026-11-02"), { description: "DOORDASH CV", date: "2026-10-31" });
// Sem código: hoje. Dezembro visto em janeiro: ano anterior.
assert.deepEqual(readPending("ZELLE TRANSACTION DEBIT", "2026-11-02"), { description: "ZELLE TRANSACTION DEBIT", date: "2026-11-02" });
assert.equal(readPending("LOJA X 12302010 3145", "2027-01-02").date, "2026-12-30");

assert.ok(sameMerchant("PIE PLACE 10292109 3145", "Pie Place"));
assert.ok(sameMerchant("ZELLE TRANSACTION CREDIT", "Zelle Credit"));
assert.ok(sameMerchant("DD *DOORDASH CV 10311816 3145", "DoorDash"));
assert.ok(!sameMerchant("Walmart", "Shell"));

const pend: PendingCandidate[] = [
  { id: "d", date: "2026-10-31", amountCents: 3608, direction: "out", description: "DD *DOORDASH CV 10311816 3145" },
  { id: "w", date: "2026-10-31", amountCents: 18257, direction: "out", description: "WM SUPERCENTER 10311149 3145" },
  { id: "z", date: "2026-11-01", amountCents: 62500, direction: "in", description: "ZELLE TRANSACTION CREDIT" },
  { id: "s", date: "2026-10-29", amountCents: 2029, direction: "out", description: "SHELL/SHELL 10291525 3145" },
];

// Valor igual: substitui, mesmo com nome diferente ("WM SUPERCENTER" lança como "Walmart").
assert.deepEqual(matchPending({ date: "2026-11-02", amountCents: 18257, direction: "out", description: "Walmart" }, pend, new Set()), { candidate: pend[1], exact: true });
// Gorjeta: mesmo nome, valor um pouco maior.
assert.deepEqual(matchPending({ date: "2026-11-03", amountCents: 4000, direction: "out", description: "DoorDash" }, pend, new Set()), { candidate: pend[0], exact: false });
// Valor diferente e nome diferente: não é o mesmo.
assert.equal(matchPending({ date: "2026-11-03", amountCents: 4000, direction: "out", description: "Starbucks" }, pend, new Set()), null);
// Longe demais (mais de 10 dias) ou antes demais: não.
assert.equal(matchPending({ date: "2026-11-15", amountCents: 18257, direction: "out", description: "Walmart" }, pend, new Set()), null);
assert.equal(matchPending({ date: "2026-10-25", amountCents: 18257, direction: "out", description: "Walmart" }, pend, new Set()), null);
// Sentido conta: entrada não substitui saída.
assert.equal(matchPending({ date: "2026-11-02", amountCents: 2029, direction: "in", description: "Shell" }, pend, new Set()), null);
// Um pendente substitui uma linha só.
assert.equal(matchPending({ date: "2026-11-02", amountCents: 62500, direction: "in", description: "Zelle Credit" }, pend, new Set(["z"])), null);
// Muito a mais (não é gorjeta): não.
assert.equal(matchPending({ date: "2026-11-02", amountCents: 9000, direction: "out", description: "DoorDash" }, pend, new Set()), null);

// O mesmo pendente visto de novo em outro print: já entrou.
assert.equal(isKnownPending({ date: "2026-10-31", amountCents: 3608, direction: "out", description: "DOORDASH CV" }, pend, new Set())?.id, "d");
assert.equal(isKnownPending({ date: "2026-10-31", amountCents: 3608, direction: "out", description: "Pizzaria" }, pend, new Set()), null);

console.log("check-bank-pending: ok");
