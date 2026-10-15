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

// Topo do app com "Projected available balance" (não é lançamento), a seção
// "Pending" (confere a corrente mas fica de fora), "-$" lido como 5 mesmo
// com o "$" e a linha mais antiga com o sinal perdido.
const top = screen([
  { name: "Projected available balance", amount: "-$40.00" },
  { date: "Pending" },
  { name: "Cloud Box", amount: "$15.00", balance: "-$40.00", conf: 20 },
  { name: "Streaming", amount: "-$80.00", balance: "-$25.00" },
]);
const posted = screen([
  { date: "10/13/2026" },
  { name: "Service Fee", amount: "50.50", balance: "$55.00" },
  { name: "Tools Co", amount: "-$24.50", balance: "$55.50" },
  { name: "Music Store", amount: "$519.00", balance: "$80.00", conf: 70 },
  { name: "Host Plan", amount: "$20.00", balance: "$99.00", conf: 20 },
]);
// Rolou: repete a última linha com o fim do nome cortado e traz a mais antiga.
const older = screen([
  { date: "10/13/2026" },
  { name: "Host Pla", amount: "-$20.00", balance: "$99.00" },
  { name: "Course Hub", amount: "$81.00", balance: "$119.00", conf: 12 },
]);
const pend = screensToStatement([posted, older, top]);
assert.equal(pend.hasBalances, true, "o rótulo de saldo não desliga a conferência");
assert.equal(pend.pending, 2, "os pendentes ficam de fora");
assert.equal(pend.undated, 0);
assert.deepEqual(
  pend.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`),
  ["in 8100 Course Hub", "out 2000 Host Plan", "out 1900 Music Store", "out 2450 Tools Co", "out 50 Service Fee"],
  "sem rótulo, sem pendentes, sem repetir o Host; $519.00 virou -19.00",
);
assert.deepEqual(pend.unchecked.map((u) => u.description), ["Course Hub"], "a mais antiga fica marcada como não conferida");
// Com o saldo que o Velun tem antes dela, a mais antiga também confere.
const withOpening = screensToStatement([posted, older, top], 20000);
assert.equal(withOpening.statement.transactions[0].direction, "out");
assert.equal(withOpening.statement.transactions[0].amountCents, 8100);
assert.deepEqual(withOpening.unchecked, []);
assert.equal(withOpening.statement.beginningBalanceCents, 20000);
assert.equal(withOpening.statement.endingBalanceCents, 5500, "saldo do último lançado, sem os pendentes");
assert.equal(verifyStatement(withOpening.statement).matches, true);

// Uma linha sem saldo no meio não desliga a conferência das outras.
const gap = screensToStatement([
  screen([
    { date: "10/2/2026" },
    { name: "Mercado", amount: "54.00", balance: "$10.00", conf: 40 },
    { name: "Padaria", amount: "-$6.00", balance: "$14.00" },
    { name: "Sem Saldo", amount: "-$1.00" },
    { name: "Farmacia", amount: "-$3.00", balance: "$30.00" },
  ]),
]);
assert.equal(gap.hasBalances, false, "\"Sem Saldo\" é nome de loja, não rótulo");
assert.deepEqual(
  gap.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`).reverse(),
  ["out 400 Mercado", "out 600 Padaria", "out 100 Sem Saldo", "out 300 Farmacia"],
);
assert.deepEqual(gap.unchecked.map((u) => u.description), ["Padaria", "Sem Saldo", "Farmacia"]);

console.log("check-screenshot-import: ok");
