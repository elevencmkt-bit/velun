// Confere o leitor do demonstrativo da Nomad com um texto inventado no
// mesmo formato do PDF (nenhum dado real aqui).
import assert from "node:assert/strict";
import { looksLikeNomad, parseNomadStatementText } from "../src/lib/import/nomad-pdf";

const header = `Cliente: FULANO DE TAL
CPF: 000.000.000-00
Endereço: Rua Exemplo, 1
Bairro Exemplo, Cidade 00000-000 - XX
Banco: Community Federal Savings Bank
Electronic/ACH Payment: 000000000
WIRE Routing Number: 000000000
Número da conta: 000000000000
Demonstrativo de transações da conta depósito
Relatório gerado no dia 20 de março de 2026, às 10:00
Saldo em 20 de março de 2026, às 10:00
US$ 1.234,56
Período
1 de fevereiro de 2026 até 1 de março de 2026`;

const footer = `Transações

-- 1 of 2 --

Este é um relatório de movimentações para simples conferência e não substitui o extrato bancário oficial, fornecido pelo Community Federal Savings Bank. Este documento é um retrato
das transações realizadas por você no período indicado, podendo haver atrasos na identificação das transações, em razão dos fluxos de processamento. Documento não oficial, sem
validade perante terceiros.
1 / 2`;

const text = `${header}
Compra MERCADO EXEMPLO
Concluído\t
28/02/2026 - 18:00 \t- US$ 1.050,40
Compra LOJA RECUSADA
Cancelado\t
27/02/2026 - 12:00 \t- US$ 99,00
Saque
Concluído\t
26/02/2026 - 09:30 \t- US$ 40,00
Compra PADARIA EXEMPLO
Processando\t
27/02/2026 - 22:40 \t- US$ 37,19
Compra LOJA ESTRANHA
Estornado\t
25/02/2026 - 10:00 \t- US$ 15,00
${footer}
${header}
Adicionou dinheiro
Concluído\t
02/02/2026 - 08:00 \t+ US$ 2.000,00
Compra CAFE*EXEMPLO
Concluído\t
02/02/2026 - 09:15 \t- US$ 4,75
Transações

-- 2 of 2 --`;

assert.equal(looksLikeNomad(text), true);
assert.equal(looksLikeNomad("Regions Bank statement"), false);

const s = parseNomadStatementText(text);
assert.equal(s.periodStart, "2026-02-01");
assert.equal(s.periodEnd, "2026-03-01");
assert.deepEqual(s.reportedBalance, { cents: 123456, date: "2026-03-20" });
assert.equal(s.cancelledCount, 1);
assert.equal(s.processingCount, 1, "processando entra");
assert.deepEqual(s.unknownStatuses, { Estornado: 1 }, "situação desconhecida é contada, não sumida");
assert.deepEqual(
  s.transactions.map((t) => [t.date, t.direction, t.amountCents, t.description]),
  [
    ["2026-02-02", "in", 200000, "Adicionou dinheiro"],
    ["2026-02-02", "out", 475, "Compra CAFE*EXEMPLO"],
    ["2026-02-26", "out", 4000, "Saque"],
    ["2026-02-27", "out", 3719, "Compra PADARIA EXEMPLO"],
    ["2026-02-28", "out", 105040, "Compra MERCADO EXEMPLO"],
  ],
);

assert.throws(() => parseNomadStatementText(header.replace(/Período[\s\S]*$/, "")), /período/);

// Versão em inglês (o app passou a gerar assim): mês/dia, hora com AM/PM,
// "Settled"/"Canceled", período "October, 3rd 2026 of November, 2nd 2026"
// e saldo negativo. Texto inventado no mesmo formato.
const en = `Client: JOHN DOE
CPF: 000.000.000-00
Address: Example Street, 1
Example District, City 00000-000 - XX
Bank: Community Federal Savings Bank
Electronic/ACH Payment: 000000000
WIRE Routing Number: 000000000
Account number: 000000000000
Deposit account statement
Report generated on November 02, 2026 at 12:54 PM
Balance on November 02, 2026 at 12:54 PM
US$ -3,38
Period of activity
October, 3rd 2026 of November, 2nd 2026
Purchase STREAMING CO
Canceled\t
11/02/2026 - 8:50 AM \t- US$ 9,99
Purchase GROCERY EXAMPLE
Settled\t
10/12/2026 - 10:40 PM \t- US$ 37,19
Added funds
Settled\t
10/05/2026 - 3:15 PM \t+ US$ 1.217,56
Purchase PENDING SHOP
Processing\t
10/31/2026 - 11:05 AM \t- US$ 4,50
Transactions
This is a transaction report for simple checking and does not replace the official bank statement, provided by Community Federal Savings Bank. This document is a portrait of the
transactions carried out by you in the indicated period, and there may be delays in indicating transactions, due to processing flows. Unofficial document, not valid before third. \t1 / 1

-- 1 of 1 --`;
assert.equal(looksLikeNomad(en), true);
const e = parseNomadStatementText(en);
assert.equal(e.periodStart, "2026-10-03");
assert.equal(e.periodEnd, "2026-11-02");
assert.deepEqual(e.reportedBalance, { cents: -338, date: "2026-11-02" });
assert.equal(e.cancelledCount, 1);
assert.equal(e.processingCount, 1);
assert.deepEqual(e.unknownStatuses, {});
assert.deepEqual(
  e.transactions.map((t) => `${t.date} ${t.direction} ${t.amountCents} ${t.description}`),
  [
    "2026-10-05 in 121756 Added funds",
    "2026-10-12 out 3719 Purchase GROCERY EXAMPLE",
    "2026-10-31 out 450 Purchase PENDING SHOP",
  ],
  "mês/dia: 10/12 é 12 de outubro",
);

console.log("check-nomad: ok");
