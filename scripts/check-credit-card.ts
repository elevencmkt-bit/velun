// Confere o cálculo das faturas. Rodar: npx tsx scripts/check-credit-card.ts
import { buildStatements, closingFor, dueFor, currentDebt, type CardTransaction } from "../src/lib/credit-card";

let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "  ok   " : "  FALHA"} ${name}${ok ? "" : ` — veio ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`}`);
}

// Datas
eq("compra antes do fechamento entra na fatura do mês", closingFor("2026-10-10", 28), "2026-10-28");
eq("compra no dia do fechamento ainda entra", closingFor("2026-10-28", 28), "2026-10-28");
eq("compra depois do fechamento vai pra seguinte", closingFor("2026-10-29", 28), "2026-11-28");
eq("fechamento dia 31 em fevereiro vira dia 28", closingFor("2027-02-10", 31), "2027-02-28");
eq("vencimento no mês seguinte quando o dia é menor", dueFor("2026-10-28", 22), "2026-11-22");
eq("vencimento no mesmo mês quando o dia é maior", dueFor("2026-10-05", 25), "2026-10-25");

const s = { closeDay: 28, dueDay: 22, openingBalanceCents: 0 };
const buy = (id: string, date: string, cents: number): CardTransaction => ({ id, date, amount_cents: cents, direction: "out", transfer_group_id: null });
const refund = (id: string, date: string, cents: number): CardTransaction => ({ id, date, amount_cents: cents, direction: "in", transfer_group_id: null });
const pay = (id: string, date: string, cents: number): CardTransaction => ({ id, date, amount_cents: cents, direction: "in", transfer_group_id: "g" + id });

// Setembro: 100 + 50 − 20 de estorno = 130. Outubro aberta com 40.
const txs = [buy("a", "2026-09-05", 10000), buy("b", "2026-09-20", 5000), refund("c", "2026-09-21", 2000), buy("d", "2026-10-02", 4000)];

let st = buildStatements(txs, s, "2026-10-12");
eq("duas faturas", st.length, 2);
eq("setembro: total 130, fechada, vence 22/10", [st[0].closing, st[0].totalCents, st[0].status, st[0].due], ["2026-09-28", 13000, "closed", "2026-10-22"]);
eq("setembro: compras 150, estorno 20", [st[0].chargesCents, st[0].creditsCents], [15000, 2000]);
eq("outubro aberta mostra a dívida até o fechamento (130 + 40)", [st[1].status, st[1].totalCents], ["open", 17000]);

st = buildStatements(txs, s, "2026-10-25");
eq("sem pagar depois do vencimento: vencida", st[0].status, "overdue");

st = buildStatements([...txs, pay("p1", "2026-10-20", 13000)], s, "2026-10-25");
eq("pagou o total: paga", [st[0].status, st[0].remainingCents], ["paid", 0]);
eq("outubro só com a compra nova (40)", st[1].totalCents, 4000);

st = buildStatements([...txs, pay("p1", "2026-10-20", 5000)], s, "2026-11-01");
eq("pagamento parcial: faltam 80", [st[0].status, st[0].remainingCents], ["overdue", 8000]);
eq("o resto (80) entra na fatura de outubro com a compra (40)", [st[1].status, st[1].totalCents], ["closed", 12000]);

st = buildStatements([...txs, pay("p1", "2026-10-20", 5000), pay("p2", "2026-11-15", 12000)], s, "2026-11-16");
eq("quitou depois: as duas pagas", [st[0].status, st[1].status], ["paid", "paid"]);

eq("dívida de hoje", currentDebt(txs, s, "2026-10-12"), 17000);
eq("cartão sem movimento: uma fatura aberta zerada", buildStatements([], s, "2026-10-12").map((x) => [x.status, x.totalCents]), [["open", 0]]);
eq("compra prevista no mês seguinte cria a fatura seguinte", buildStatements([buy("f", "2026-11-03", 999)], s, "2026-10-12").length, 2);
eq("saldo inicial negativo é dívida antiga", buildStatements([], { ...s, openingBalanceCents: -5000 }, "2026-10-12")[0].totalCents, 5000);

console.log(fail ? `\n${fail} FALHA(S)` : "\nTUDO PASSOU");
if (fail) process.exit(1);
