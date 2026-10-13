// Rodar: npx tsx scripts/check-match-exact.ts
import assert from "node:assert/strict";
import { matchConfirmed, matchConfirmedExact } from "../src/lib/import/match-confirmed";

const line = (date: string, cents: number, fp: string, free = true) =>
  ({ date, amountCents: cents, direction: "out" as const, fingerprint: fp, free });
const cand = (id: string, date: string, cents: number) =>
  ({ id, date, amountCents: cents, direction: "out" as const, fingerprint: `manual-${id}` });

// Extrato de outubro × o que foi digitado à mão.
const lines = [
  line("2026-09-25", 1000, "b1"), // Anthropic
  line("2026-09-25", 1000, "b2"), // Anthropic (de novo, mesmo dia)
  line("2026-09-28", 1000, "b3"), // Manus, outro dia, mesmo valor
  line("2026-10-12", 1058, "b4"), // pendente que postou 3 dias depois
  line("2026-10-01", 999, "b5"), // não foi digitado
  line("2026-09-23", 8515, "b6", false), // já é duplicata
];
const cands = [
  cand("a1", "2026-09-25", 1000),
  cand("a2", "2026-09-25", 1000),
  cand("m1", "2026-09-28", 1000),
  cand("p1", "2026-10-09", 1058),
  cand("w1", "2026-09-23", 8515),
];

const exact = matchConfirmedExact(lines, cands);
assert.deepEqual([...exact.entries()], [[0, "a1"], [1, "a2"], [2, "m1"]], "mesmo dia casa um a um");
assert.equal(exact.has(5), false, "linha que já é duplicata fica de fora");

// O que sobra vai pro nível 1 (sugestão desmarcada): o pendente que mudou de dia.
const used = new Set(exact.values());
const rest = matchConfirmed(
  lines.map((l, i) => ({ ...l, free: l.free && !exact.has(i) })),
  cands.filter((c) => !used.has(c.id)),
);
assert.deepEqual([...rest.entries()], [[3, "p1"]]);
console.log("check-match-exact: ok");
