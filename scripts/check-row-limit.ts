// O Supabase devolve no máximo 1000 linhas por consulta e corta o resto
// sem avisar. Isso já deixou saldo errado (#47) e lista incompleta.
//
// Esta verificação lê o código e acusa toda consulta a tabelas que
// crescem sem limite (lançamentos, revisão de importação, recorrências)
// que não seja paginada (fetchAll / .range), limitada (.limit, .single,
// .maybeSingle, por id) — ou que não tenha, nas 3 linhas acima, um
// comentário "// limite: <por que nunca passa de 1000>".
//
// Rodar: npx tsx scripts/check-row-limit.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TABLES = ["transactions", "staged_transactions", "recurrences"];
const BOUNDED = [".range(", ".limit(", "maybeSingle", ".single(", '.eq("id"', '.in("id"', '.eq("import_id"', "head: true"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

const problems: string[] = [];
for (const file of files("src")) {
  const src = readFileSync(file, "utf8");
  const re = new RegExp(`\\.from\\("(${TABLES.join("|")})"\\)`, "g");
  for (const m of src.matchAll(re)) {
    const start = m.index!;
    const after = src.slice(start, start + 900);
    const end = after.search(/;\s*\n|\n\s*\n/);
    const stmt = end > 0 ? after.slice(0, end) : after;
    if (!stmt.includes(".select(")) continue; // insert/update/delete
    if (BOUNDED.some((b) => stmt.includes(b))) continue;
    const before = src.slice(Math.max(0, start - 400), start);
    if (before.includes("fetchAll")) continue;
    const lines = before.split("\n").slice(-4).join("\n");
    if (/\/\/ limite:/.test(lines)) continue;
    const line = src.slice(0, start).split("\n").length;
    problems.push(`${file}:${line} consulta a "${m[1]}" sem paginação nem "// limite: ..."`);
  }
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} consulta(s) podem passar de 1000 linhas. Use fetchAll ou explique com "// limite:".`);
  process.exit(1);
}
console.log("check-row-limit: ok");
