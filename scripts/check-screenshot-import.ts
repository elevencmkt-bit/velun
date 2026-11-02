// Rodar: npx tsx scripts/check-screenshot-import.ts
// Telas inventadas no formato do reconhecimento (palavra + caixa), imitando
// a lista do app do banco: cabeçalho de data, nome à esquerda, valor à
// direita e o saldo logo abaixo.
import assert from "node:assert/strict";
import { verifyStatement } from "../src/lib/import/verify";
import { screensToStatement, type OcrScreen, type OcrWord } from "../src/lib/import/screenshot";

type Item = {
  date?: string;
  name?: string;
  amount?: string;
  balance?: string;
  conf?: number;
  green?: boolean;
  /** Caixa do valor com o dobro da altura, engolindo a linha do saldo. */
  tall?: boolean;
  /** Fim do cartão no meio da linha ("9889"), na metade direita da tela. */
  tail?: string;
};

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
    if (it.tail) words.push({ text: it.tail, confidence: 95, x0: 640, y0: y + 22, x1: 700, y1: y + 52 });
    if (it.amount !== undefined)
      words.push({
        text: it.amount,
        confidence: it.conf ?? 92,
        x0: 930,
        y0: y,
        x1: 1064,
        y1: y + (it.tall ? 84 : 36),
        ...(it.green === undefined ? {} : { green: it.green }),
      });
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

// Ordem trocada de propósito: o Velun ordena pela data. Com o saldo que o
// Velun tem antes do mais antigo (-$43.08), até ele confere.
const r = screensToStatement([s2, s1], -4308);
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
const misread = screensToStatement([a1, a2], 1905);
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

// Sem o saldo do Velun, a mais antiga (Starbucks) fica de fora e o saldo
// dela vira o ponto de partida.
const noOpening = screensToStatement([s2, s1]);
assert.equal(noOpening.statement.transactions.length, 5);
assert.equal(noOpening.oldest?.excluded, true);
assert.equal(noOpening.statement.beginningBalanceCents, -5675);
assert.equal(verifyStatement(noOpening.statement).matches, true);

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
  ["out 2000 Host Plan", "out 1900 Music Store", "out 2450 Tools Co", "out 50 Service Fee"],
  "sem rótulo, sem pendentes, sem repetir o Host; $519.00 virou -19.00",
);
assert.deepEqual(pend.oldest, { date: "2026-10-13", description: "Course Hub", balanceCents: 11900, excluded: true }, "a mais antiga, sem como conferir, fica de fora");
assert.deepEqual(pend.unchecked, []);
assert.equal(pend.statement.beginningBalanceCents, 11900, "o saldo dela vira o ponto de partida");
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
// O saldo da linha sem saldo sai da conta; aqui a conta não fecha
// (Padaria $14 ≠ $30 − $1 − $6), então as duas ficam pra conferir. A mais
// antiga não tem a de baixo: fica de fora e o saldo dela é o ponto de
// partida, como em qualquer print com saldo.
assert.deepEqual(
  gap.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`).reverse(),
  ["out 400 Mercado", "out 600 Padaria", "out 100 Sem Saldo"],
  "\"Sem Saldo\" é nome de loja, não rótulo",
);
assert.deepEqual(gap.unchecked.map((u) => u.description), ["Padaria", "Sem Saldo"]);
assert.equal(gap.oldest?.description, "Farmacia");

// Rolando a tela, a data do dia fica presa no topo e a linha que passa
// por baixo dela sai pela metade: sem o valor, o leitor pegava o saldo
// como valor ("acia +$741.01"). E com dois prints que têm "Pending", o
// que só tem pendentes (o de cima) vinha depois do outro, a emenda não
// casava e a última linha comum entrava duas vezes.
const pendTop = screen([
  { date: "Pending" },
  { name: "Cafe Novo", amount: "-$9.00", balance: "$40.00" },
  { name: "Posto Azul", amount: "-$11.00", balance: "$49.00" },
  { name: "Loja Pend", amount: "-$5.00", balance: "$60.00" },
]);
const pendScrolled = screen([
  { date: "Pending" },
  { name: "Loja Pend", amount: "-$5.00", balance: "$60.00" },
  { date: "10/30/2026" },
  { name: "Mercadinho", amount: "-$30.18", balance: "$65.00" },
]);
const midList = screen([
  { date: "10/30/2026" },
  { name: "Mercadinho", amount: "-$30.18", balance: "$65.00" },
  { date: "10/28/2026" },
  { name: "Farmacia Sol", amount: "56.38", balance: "$95.18", conf: 55 },
]);
const scrolled = screen([
  { date: "10/28/2026" },
  { name: "acia", amount: "$95.18" },
  { name: "Padaria Lua", amount: "-$12.00", balance: "$101.56" },
  { name: "Zelle Credit", amount: "3266.50", balance: "$113.56", conf: 50 },
]);
const sticky = screensToStatement([pendScrolled, midList, scrolled, pendTop], -15294);
assert.equal(sticky.cut, 1, "a linha cortada embaixo da data fica de fora, e é contada");
assert.equal(sticky.hasBalances, true, "e não desliga a conferência pelo saldo");
assert.deepEqual(
  sticky.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`),
  ["in 26650 Zelle Credit", "out 1200 Padaria Lua", "out 638 Farmacia Sol", "out 3018 Mercadinho"],
  "sem o saldo virando lançamento, Mercadinho uma vez só, 56.38 → -6.38 e 3266.50 → 266.50",
);
assert.deepEqual(sticky.unchecked, []);
assert.equal(sticky.pending, 3);
assert.deepEqual(
  sticky.pendingRows.map((p) => `${p.amountCents} ${p.description} ${p.checked ? "ok" : "?"}`),
  ["-900 Cafe Novo ok", "-1100 Posto Azul ok", "-500 Loja Pend ok"],
  "os pendentes saem com o valor conferido pela corrente, do mais novo pro mais antigo",
);
// Sem saldo nenhum no print, a linha da ponta não é "cortada": entra.
assert.equal(screensToStatement([screen([{ date: "9/30/2026" }, { name: "Netflix", amount: "-$15.49" }])]).cut, 0);

// Print só com pendentes: a última linha não tem a de baixo pra conferir e
// o "-" sumiu ("$16.43"). Valor escrito em preto, no app, é saída; verde é
// entrada. Sem a cor (leitor antigo), fica como foi lido.
const onlyPend = screen([
  { date: "Pending" },
  { name: "Zelle Credit", amount: "$625.00", balance: "$888.70", green: true },
  { name: "Mercado Bom", amount: "-$6.90", balance: "$263.70", green: false },
  { name: "Cafe Lua", amount: "$16.43", balance: "$270.60", green: false },
]);
const op = screensToStatement([onlyPend]);
assert.equal(op.statement.transactions.length, 0);
assert.deepEqual(
  op.pendingRows.map((p) => `${p.amountCents} ${p.description} ${p.checked ? "ok" : "?"}`),
  ["62500 Zelle Credit ok", "-690 Mercado Bom ok", "-1643 Cafe Lua ?"],
  "a cor dá o sinal da linha que o saldo não confere",
);
const noColor = screensToStatement([
  screen([{ date: "Pending" }, { name: "Mercado Bom", amount: "-$6.90", balance: "$263.70" }, { name: "Cafe Lua", amount: "$16.43", balance: "$270.60" }]),
]);
assert.equal(noColor.pendingRows[1].amountCents, 1643, "sem cor, vale o lido");
// Verde lido sem "+" numa linha conferida não muda nada (o saldo manda).
const greenIn = screensToStatement([
  screen([{ date: "Pending" }, { name: "Deposito", amount: "$50.00", balance: "$60.00", green: true }, { name: "Taxa", amount: "-$1.00", balance: "$10.00", green: false }]),
]);
assert.deepEqual(greenIn.pendingRows.map((p) => p.amountCents), [5000, -100]);

// Leituras ruins de verdade, num print só (valores inventados):
// - o saldo de uma linha lido errado ("$94.08" virou "6290.08"): ele sai
//   da conta, e o valor de cima ("926.76", o "$" lido como 9) confere
//   pelos saldos vizinhos;
// - vírgula no lugar do ponto ("51,34", o "-$" lido como 5);
// - valor sem o ponto e numa caixa dupla, sem a linha do saldo
//   ("31680" = -$16.80), duas linhas seguidas;
// - nome sem valor nenhum (o leitor não entendeu a caixa): o valor sai
//   da diferença dos saldos;
// - o fim do cartão no meio da linha não é valor.
const rough = screensToStatement([
  screen([
    { date: "Pending" },
    { name: "Cafe Norte", amount: "-$3.00", balance: "-$6.20", tail: "4321" },
    { name: "Nuvem Mensal", amount: "31680", tall: true, tail: "4321" },
    { name: "Nuvem Anual", amount: "32640", tall: true, tail: "4321" },
    { name: "Estacionamento", amount: "345.00", balance: "$40.00", conf: 20, green: false, tail: "4321" },
    { name: "Garagem Centro" },
    { name: "Posto Sul", amount: "-$10.00", balance: "$135.00", tail: "4321" },
    { date: "10/27/2026" },
    { name: "Imposto", amount: "-$120.00", balance: "$145.00" },
    { name: "Mercado Online", amount: "926.76", balance: "$265.00", conf: 55 },
    { name: "Estacionamento", amount: "-$45.50", balance: "6290.08", conf: 31 },
    { name: "Loja Azul", amount: "-$17.59", balance: "$337.26" },
    { date: "10/23/2026" },
    { name: "Estudio Criativo", amount: "51.34", balance: "$354.85", conf: 60 },
    { name: "Estudio Criativo", amount: "51,34", balance: "$356.19", conf: 62 },
    { name: "Dominio", amount: "-$13.19", balance: "$357.53" },
  ]),
]);
assert.deepEqual(
  rough.statement.transactions.map((x) => `${x.date} ${x.direction} ${x.amountCents} ${x.description}`).reverse(),
  [
    "2026-10-27 out 12000 Imposto",
    "2026-10-27 out 2676 Mercado Online",
    "2026-10-27 out 4550 Estacionamento",
    "2026-10-27 out 1759 Loja Azul",
    "2026-10-23 out 134 Estudio Criativo",
    "2026-10-23 out 134 Estudio Criativo",
  ],
  "saldo errado ignorado: 926.76 → -26.76; vírgula: 51,34 → -1.34",
);
assert.deepEqual(rough.unchecked, [], "com o saldo do meio tirado da conta, tudo confere");
assert.deepEqual(
  rough.pendingRows.map((p) => `${p.amountCents} ${p.description} ${p.checked ? "ok" : "?"}`),
  [
    "-300 Cafe Norte 4321 ?",
    "-1680 Nuvem Mensal 4321 ?",
    "-2640 Nuvem Anual 4321 ?",
    "-4500 Estacionamento 4321 ?",
    "-5000 Garagem Centro ?",
    "-1000 Posto Sul 4321 ok",
  ],
  "sem ponto, sem saldo e sem valor: tudo sai da conta, e fica pra conferir",
);
assert.deepEqual(rough.unread, []);

// Nome sem valor sem saldo em volta pra explicar: fica de fora, e avisa.
const unreadable = screensToStatement([
  screen([
    { date: "10/2/2026" },
    { name: "Mercado", amount: "-$4.00", balance: "$10.00" },
    { name: "Padaria", amount: "-$6.00" },
    { name: "Sem Valor Legivel" },
    { name: "Farmacia", amount: "-$3.00" },
  ]),
]);
assert.deepEqual(unreadable.unread, [{ description: "Sem Valor Legivel", pending: false }]);
assert.equal(unreadable.statement.transactions.length, 3);

// "$100.00" lido duas vezes, uma delas como "100." (sobreposta): não é $1.00.
const twice = screen([
  { date: "10/26/2026" },
  { name: "Zelle Credit", amount: "3100.00", balance: "$513.91", green: true },
  { name: "Assinatura", amount: "-$8.94", balance: "$413.91" },
]);
twice.words.push({ text: "100.", confidence: 96, x0: 951, y0: 305, x1: 1021, y1: 332, green: true });
const tw = screensToStatement([twice], 42285);
assert.deepEqual(
  tw.statement.transactions.map((x) => `${x.direction} ${x.amountCents} ${x.description}`).reverse(),
  ["in 10000 Zelle Credit", "out 894 Assinatura"],
);

console.log("check-screenshot-import: ok");
