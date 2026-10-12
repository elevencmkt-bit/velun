// Confere a leitura da fatura do Nubank com um texto no mesmo formato que
// o leitor de PDF do navegador produz (dados inventados).
// Rodar: npx tsx scripts/check-nubank.ts
import {
  parseNubankStatementText,
  verifyCardStatement,
  looksLikeNubank,
} from "../src/lib/import/nubank-pdf";

let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(
    `${ok ? "  ok   " : "  FALHA"} ${name}${ok ? "" : ` — veio ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`}`,
  );
}

const sample = `Olá, Fulana.
Esta é a sua fatura de
janeiro, no valor de
R$ 1.062,49
Data de vencimento: 08 JAN 2027
-- 1 of 3 --
FULANA DE TAL
FATURA 08 JAN 2027 EMISSÃO E ENVIO 01 JAN 2027
RESUMO DA FATURA ATUAL
Fatura anterior R$ 500,00
Pagamento recebido R$ 500,00
Total de compras de todos os cartões, 01 DEZ a 01 JAN R$ 1.050,49
Outros lançamentos R$ 12,00
Total a pagar R$ 1.062,49
Nu Pagamentos S.A.
-- 2 of 3 --
FULANA DE TAL
FATURA 08 JAN 2027 EMISSÃO E ENVIO 01 JAN 2027
TRANSAÇÕES DE 01 DEZ A 01 JAN
Fulana de Tal R$ 1.050,49
03 DEZ Pagamento em 03 DEZ −R$ 500,00
05 DEZ Mercado Livre - Parcela 3/6 R$ 120,00
10 DEZ Ifood *Restaurante R$ 45,90
12 DEZ Estorno Ifood −R$ 15,41
20 DEZ Amazon Marketplace R$ 1.400,00
-- 3 of 3 --
FULANA DE TAL
FATURA 08 JAN 2027 EMISSÃO E ENVIO 01 JAN 2027
22 DEZ Estorno parcial Amazon
Referente ao pedido de R$ 1.400,00
−R$ 500,00
01 JAN Uber *Trip R$ 0,00
Pagamentos e Financiamentos R$ 12,00
21 DEZ Saldo em atraso
R$ 50,00
21 DEZ Crédito de atraso −R$ 50,00
31 DEZ IOF de compra internacional R$ 12,00
`;

eq("reconhece como Nubank", looksLikeNubank(sample), true);
const s = parseNubankStatementText(sample);
eq("vencimento", s.dueDate, "2027-01-08");
eq(
  "período atravessa o ano novo",
  [s.periodStart, s.periodEnd],
  ["2026-12-01", "2027-01-01"],
);
eq(
  "totais do resumo",
  [s.totalCents, s.previousCents, s.paymentsCents],
  [106249, 50000, 50000],
);
eq(
  "lançamentos (sem valor zero e sem o par de atraso)",
  s.transactions.map((t) => [
    t.date,
    t.description,
    t.direction,
    t.amountCents,
  ]),
  [
    ["2026-12-03", "Pagamento em 03 DEZ", "in", 50000],
    ["2026-12-05", "Mercado Livre - Parcela 3/6", "out", 12000],
    ["2026-12-10", "Ifood *Restaurante", "out", 4590],
    ["2026-12-12", "Estorno Ifood", "in", 1541],
    ["2026-12-20", "Amazon Marketplace", "out", 140000],
    ["2026-12-22", "Estorno parcial Amazon", "in", 50000],
    ["2026-12-31", "IOF de compra internacional", "out", 1200],
  ],
);
// 120 + 45,90 − 15,41 + 1400 − 500 + 12 − 500 (pagamento) = 562,49
// = total (1062,49) − fatura anterior (500): fecha.
const v = verifyCardStatement(s);
eq(
  "conferência fecha",
  [v.matches, v.extractedSumCents, v.expectedCents],
  [true, 56249, 56249],
);
eq(
  "um centavo de arredondamento do banco é aceito",
  verifyCardStatement({ ...s, totalCents: s.totalCents + 1 }).matches,
  true,
);
eq(
  "um lançamento perdido não passa",
  verifyCardStatement({ ...s, transactions: s.transactions.slice(1) }).matches,
  false,
);

console.log(fail ? `\n${fail} FALHA(S)` : "\nTUDO PASSOU");
if (fail) process.exit(1);
