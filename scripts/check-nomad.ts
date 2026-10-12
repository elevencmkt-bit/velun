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
assert.deepEqual(
  s.transactions.map((t) => [t.date, t.direction, t.amountCents, t.description]),
  [
    ["2026-02-02", "in", 200000, "Adicionou dinheiro"],
    ["2026-02-02", "out", 475, "Compra CAFE*EXEMPLO"],
    ["2026-02-26", "out", 4000, "Saque"],
    ["2026-02-28", "out", 105040, "Compra MERCADO EXEMPLO"],
  ],
);

assert.throws(() => parseNomadStatementText(header.replace(/Período[\s\S]*$/, "")), /período/);

console.log("check-nomad: ok");
