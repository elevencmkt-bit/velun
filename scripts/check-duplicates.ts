// Rodar: npx tsx scripts/check-duplicates.ts
import assert from "node:assert/strict";
import { duplicateCounter, statementDuplicates } from "../src/lib/import/duplicates";

// Conta já tem 1 taxa e 2 saques iguais no dia; o extrato traz 2 taxas e 3 saques.
const isDup = duplicateCounter(["taxa", "saque", "saque"]);
assert.deepEqual(
  ["taxa", "taxa", "saque", "saque", "saque", "cafe"].map(isDup),
  [true, false, true, true, false, false],
);
// Extrato em PDF depois de prints do mesmo período: o print gravou o nome
// do app ("Stltones.Com"), o PDF traz o do extrato ("STL TONES"). Impressão
// digital diferente, mas o que veio de importação vale por dia + valor.
// O digitado à mão continua só pela impressão digital.
const existing = [
  { fingerprint: "print-stl", date: "2026-10-13", direction: "out", amount_cents: 1499, status: "cleared", import_id: "imp-print" },
  { fingerprint: "print-net", date: "2026-10-13", direction: "out", amount_cents: 2000, status: "cleared", import_id: "imp-print" },
  { fingerprint: "pdf-fee", date: "2026-10-13", direction: "out", amount_cents: 32, status: "cleared", import_id: "imp-pdf" },
  { fingerprint: "manual-cafe", date: "2026-10-13", direction: "out", amount_cents: 500, status: "cleared", import_id: null },
  { fingerprint: "forecast", date: "2026-10-13", direction: "out", amount_cents: 999, status: "pending", import_id: "imp-print" },
];
assert.deepEqual(
  statementDuplicates(existing, [
    { fingerprint: "pdf-stl", date: "2026-10-13", direction: "out", amountCents: 1499 },
    { fingerprint: "pdf-net", date: "2026-10-13", direction: "out", amountCents: 2000 },
    { fingerprint: "pdf-net-2", date: "2026-10-13", direction: "out", amountCents: 2000 },
    { fingerprint: "pdf-fee", date: "2026-10-13", direction: "out", amountCents: 32 },
    { fingerprint: "pdf-cafe", date: "2026-10-13", direction: "out", amountCents: 500 },
    { fingerprint: "pdf-x", date: "2026-10-13", direction: "out", amountCents: 999 },
  ]),
  [true, true, false, true, false, false],
  "print vira repetido por dia+valor (uma vez cada); exata gasta a sua; à mão e previsão não contam",
);
// A exata mais abaixo não perde a existente pra uma solta mais acima.
assert.deepEqual(
  statementDuplicates(
    [{ fingerprint: "a", date: "2026-10-01", direction: "out", amount_cents: 100, status: "cleared", import_id: "i" }],
    [
      { fingerprint: "b", date: "2026-10-01", direction: "out", amountCents: 100 },
      { fingerprint: "a", date: "2026-10-01", direction: "out", amountCents: 100 },
    ],
  ),
  [false, true],
);
console.log("check-duplicates: ok");
