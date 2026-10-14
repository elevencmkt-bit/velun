// Rodar: npx tsx scripts/check-screenshot-import.ts
// Telas inventadas no formato do reconhecimento (palavra + caixa), imitando
// a lista do app do banco: cabeçalho de data, nome à esquerda, valor à
// direita e o saldo logo abaixo.
import assert from "node:assert/strict";
import { verifyStatement } from "../src/lib/import/verify";
import { screensToStatement, type OcrScreen, type OcrWord } from "../src/lib/import/screenshot";

type Item = { date?: string; name?: string; amount?: string; balance?: string; conf?: number };

function screen(items: Item[]): OcrScreen {
  const words: OcrWord[] = [];
  let y = 300;
  for (const it of items) {
    if (it.date) {
      words.push({ text: it.date, confidence: 95, x0: 80, y0: y, x1: 205, y1: y + 26 });
      y += 100;
      continue;
    }
    let x = 80;
    for (const part of (it.name ?? "").split(" ")) {
      words.push({ text: part, confidence: 95, x0: x, y0: y + 22, x1: x + part.length * 14, y1: y + 52 });
      x += part.length * 14 + 12;
    }
    words.push({ text: it.amount!, confidence: it.conf ?? 92, x0: 930, y0: y, x1: 1064, y1: y + 36 });
    if (it.balance) words.push({ text: it.balance, confidence: 92, x0: 980, y0: y + 58, x1: 1064, y1: y + 84 });
    words.push({ text: ">", confidence: 90, x0: 1089, y0: y + 24, x1: 1109, y1: y + 58 });
    y += 200;
  }
  return { width: 1170, height: 2532, words };
}

// Tela 1 (mais nova): "-$4.21" lido como "54.21", e um sinal de menos sumido no saldo.
const s1 = screen([
  { date: "10/13/2026" },
  { name: "Escola Infantil", amount: "-$282.00", balance: "-$284.01" },
  { date: "10/7/2026" },
  { name: "Snack Bar", amount: "54.21", balance: "-$2.01", conf: 51 },
  { name: "Zelle Credit", amount: "$100.00", balance: "$2.20" },
  { date: "10/6/2026" },
  { name: "Padaria", amount: "-$29.05", balance: "$97.80", conf: 40 },
]);
// Tela 2 (rolou pra baixo): repete a última linha da tela 1 e continua.
// A primeira linha está ACIMA do primeiro cabeçalho: é do dia 6.
const s2 = screen([
  { name: "Padaria", amount: "-$29.05", balance: "$97.80", conf: 40 },
  { name: "Mercado Bom", amount: "-$12.00", balance: "-$68.75" },
  { date: "10/5/2026" },
  { name: "Starbucks", amount: "-$13.67", balance: "-$56.75" },
]);

// Ordem trocada de propósito: o Velun ordena pela data.
const r = screensToStatement([s2, s1]);
assert.equal(r.undated, 0);
assert.equal(r.hasBalances, true);
const t = r.statement.transactions;
assert.equal(t.length, 6, "a linha repetida entre as telas entra uma vez só");
assert.deepEqual(
  t.map((x) => `${x.date} ${x.direction} ${x.amountCents} ${x.description}`),
  [
    "2026-10-05 out 1367 Starbucks",
    "2026-10-06 out 1200 Mercado Bom",
    "2026-10-06 out 2905 Padaria",
    "2026-10-07 in 10000 Zelle Credit",
    "2026-10-07 out 421 Snack Bar",
    "2026-10-13 out 28200 Escola Infantil",
  ],
);
assert.ok(r.corrected >= 2, "54.21 virou -4.21 e o saldo do Padaria ganhou o sinal pela corrente");
assert.equal(r.statement.beginningBalanceCents, -4308, "saldo antes do mais antigo");
assert.equal(r.statement.endingBalanceCents, -28401);
assert.equal(verifyStatement(r.statement).matches, true, "a conferência dia a dia fecha");

// A mesma linha lida diferente em cada print ("-$9.99" num, "39.99" no
// outro, o "-$" virou 3) continua sendo a mesma: entra uma vez só.
const a1 = screen([{ date: "10/6/2026" }, { name: "Uber", amount: "-$29.05", balance: "-$35.15" }, { date: "10/5/2026" }, { name: "Dash Pass", amount: "-$9.99", balance: "-$6.10" }]);
const a2 = screen([{ date: "10/5/2026" }, { name: "Dash Pass", amount: "39.99", balance: "-$6.10", conf: 60 }, { name: "Prime", amount: "-$15.16", balance: "$3.89" }]);
const misread = screensToStatement([a1, a2]);
assert.deepEqual(
  misread.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`),
  ["out 1516 Prime", "out 999 Dash Pass", "out 2905 Uber"],
  "sem o +39.99 fantasma",
);

// Sem saldo na tela: vale o que foi lido, sem conferir.
const plain = screensToStatement([
  screen([{ date: "9/30/2026" }, { name: "Netflix", amount: "-$15.49" }, { name: "Salario", amount: "$2,500.00" }]),
]);
assert.equal(plain.hasBalances, false);
assert.deepEqual(
  plain.statement.transactions.map((x) => `${x.direction} ${x.amountCents}`),
  ["in 250000", "out 1549"],
);

// Linha sem data nenhuma (nenhum cabeçalho acima, nenhuma tela antes): fica de fora e é contada.
const lost = screensToStatement([screen([{ name: "Algo", amount: "-$1.00", balance: "$5.00" }])]);
assert.equal(lost.undated, 1);
assert.equal(lost.statement.transactions.length, 0);

console.log("check-screenshot-import: ok");
