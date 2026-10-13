// Rodar: npx tsx scripts/check-fetch-all.ts
import assert from "node:assert/strict";
import { fetchAll } from "../src/lib/supabase/fetch-all";

async function main() {
// Banco de mentira que, como o Supabase, devolve no máximo 1000 por vez.
const rows = Array.from({ length: 2345 }, (_, i) => i);
const asked: [number, number][] = [];
const all = await fetchAll<number>(async (from, to) => {
  asked.push([from, to]);
  return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null };
});
assert.equal(all.length, 2345, "busca tudo, não só 1000");
assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);

const exact = await fetchAll<number>(async (from, to) => ({ data: rows.slice(0, 1000).slice(from, to + 1), error: null }));
assert.equal(exact.length, 1000, "exatamente 1000 também termina");

await assert.rejects(fetchAll(async () => ({ data: null, error: { message: "falhou" } })), /falhou/);
console.log("check-fetch-all: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
