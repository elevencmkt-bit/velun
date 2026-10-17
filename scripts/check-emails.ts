// Rodar: npx tsx scripts/check-emails.ts [pasta]
// Com uma pasta, grava o HTML de cada e-mail lá (pra abrir no navegador).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildWeek, weekSubject } from "../src/lib/email/week";
import { buildAlerts } from "../src/lib/email/alerts";
import { accountBalancesInMonth, buildMonth } from "../src/lib/email/month";
import { renderAlerts, renderInvite, renderMonthly, renderWeekly, type RenderBase } from "../src/lib/email/render";
import { dueKinds } from "../src/lib/email/run";
import { closingMonth } from "../src/lib/email/build";
import { moneyShort, rangeLabel, weekdayDate, monthBounds, previousMonth } from "../src/lib/email/format";
import type { CashAccount, UpcomingItem } from "../src/lib/email/upcoming";
import type { MonthTransaction } from "../src/lib/reports";

const out = process.argv[2];
const save = (name: string, html: string) => {
  if (!out) return;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, name), html);
};

// Dados inventados.
const today = "2026-10-19"; // segunda
const accounts: CashAccount[] = [
  { id: "biz", name: "Conta Empresa", balanceCents: 140530 },
  { id: "pes", name: "Conta Pessoal", balanceCents: 35361 },
];
let n = 0;
const item = (date: string, description: string, cents: number, direction: "in" | "out", accountId: string, extra: Partial<UpcomingItem> = {}): UpcomingItem => ({
  id: `t${++n}`,
  date,
  description,
  amountCents: cents,
  direction,
  accountId,
  accountName: accountId === "biz" ? "Conta Empresa" : "Conta Pessoal",
  categoryName: null,
  transfer: false,
  silent: false,
  bill: false,
  ...extra,
});
const items: UpcomingItem[] = [
  item("2026-10-16", "Celular", 9000, "out", "pes"),
  item("2026-10-21", "Internet", 8500, "out", "pes", { categoryName: "Moradia" }),
  item("2026-10-22", "Cliente A", 40000, "in", "biz", { categoryName: "Salário" }),
  item("2026-10-23", "Escola", 28200, "out", "pes", { categoryName: "Educação" }),
  item("2026-10-23", "Show sexta", 20000, "in", "biz"),
  item("2026-10-24", "Carro", 48000, "out", "biz", { categoryName: "Transporte" }),
  item("2026-10-24", "Show sábado", 20000, "in", "biz"),
  // Transferência: sai da empresa, entra na pessoal. Fora de sai/entra.
  item("2026-10-25", "Guardar", 10000, "out", "biz", { transfer: true, accountName: "Conta Empresa → Conta Pessoal" }),
  item("2026-10-25", "Guardar", 10000, "in", "pes", { transfer: true, silent: true }),
  // Fora da semana.
  item("2026-10-27", "Depois", 5000, "out", "biz"),
];

// --- Semana -----------------------------------------------------------------
const week = buildWeek({ today, accounts, items });
assert.equal(week.end, "2026-10-25");
assert.equal(week.outCents, 8500 + 28200 + 48000, "sai: sem atrasada e sem transferência");
assert.equal(week.inCents, 40000 + 20000 + 20000);
assert.equal(week.overdue.length, 1);
const pes = week.accounts.find((a) => a.id === "pes")!;
const biz = week.accounts.find((a) => a.id === "biz")!;
assert.equal(pes.endCents, 35361 - 9000 - 8500 - 28200 + 10000);
assert.equal(biz.endCents, 140530 + 40000 + 20000 - 48000 + 20000 - 10000);
assert.equal(week.endTotalCents, pes.endCents + biz.endCents);
// A pessoal fica negativa na sexta, quando cai a escola; falta 10339.
assert.deepEqual(pes.negative, { date: "2026-10-23", shortCents: 10339, cause: "Escola" });
assert.equal(biz.negative, null);
assert.equal(week.days.flatMap((d) => d.items).some((i) => i.silent), false, "lado de entrada da transferência não é listado");
assert.equal(weekSubject(week, "USD", moneyShort), "Sua semana: sai $847, entra $800");

const base: RenderBase = {
  firstName: "Ana",
  householdName: "Casa Teste",
  shared: true,
  currency: "USD",
  siteUrl: "https://velunapp.com",
  unsubscribeUrl: "https://velunapp.com/api/emails/sair?t=x&k=weekly",
};
const weekly = renderWeekly(week, base);
assert.match(weekly.html, /Conta Pessoal fica negativa sexta, 23\/10/);
assert.match(weekly.html, /Passe pelo menos/);
assert.match(weekly.text, /Conta por conta/);
assert.doesNotMatch(weekly.html, /undefined|NaN/);
save("semana.html", weekly.html);

// Semana vazia não quebra.
const empty = buildWeek({ today, accounts, items: [] });
assert.equal(weekSubject(empty, "USD", moneyShort), "Sua semana: nada previsto");
assert.doesNotMatch(renderWeekly(empty, base).html, /undefined|NaN/);

// --- Avisos -----------------------------------------------------------------
// Segunda 19/10: nada vence terça (20) e nada atrasou domingo (18) → sem e-mail.
assert.equal(buildAlerts({ today, accounts, items }), null);
// Terça 20/10: Internet vence amanhã → e-mail, com a atrasada junto.
const alerts = buildAlerts({ today: "2026-10-20", accounts, items })!;
assert.ok(alerts);
assert.equal(alerts.dueTomorrow.length, 1);
assert.equal(alerts.overdue.length, 1);
assert.equal(alerts.groups.length, 1);
assert.equal(alerts.groups[0].afterCents, 35361 - 8500 - 9000);
// Sábado 17/10: o Celular venceu ontem (16) → e-mail mesmo sem nada amanhã.
const late = buildAlerts({ today: "2026-10-17", accounts, items })!;
assert.ok(late);
assert.equal(late.dueTomorrow.length, 0);
const alertMail = renderAlerts(alerts, { ...base, unsubscribeUrl: null }, "2026-10-20");
assert.equal(alertMail.subject, "Amanhã vence Internet, $85.00 · 1 atrasada");
assert.match(alertMail.html, /Dá pra pagar: sobra/);
assert.doesNotMatch(alertMail.html, /undefined|NaN/);
save("aviso.html", alertMail.html);
assert.equal(renderAlerts(late, base, "2026-10-17").subject, "Ficou atrasado: Celular, $90.00");

// --- Mês --------------------------------------------------------------------
assert.equal(closingMonth("2026-10-01"), "2026-09");
assert.equal(closingMonth("2026-01-01"), "2025-12");
assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
assert.equal(previousMonth("2026-01"), "2025-12");

const row = (date: string, account_id: string, cents: number, direction: "in" | "out", category: string | null, transfer = false): MonthTransaction => ({
  id: `m${++n}`,
  account_id,
  date,
  amount_cents: cents,
  direction,
  description: category ?? "x",
  transfer_group_id: transfer ? "g1" : null,
  category_name: category,
  account_name: account_id,
});
const rows = [
  row("2026-09-01", "biz", 600000, "in", "Salário"),
  row("2026-09-03", "pes", 250000, "in", "Salário"),
  row("2026-09-05", "biz", 238500, "out", "Moradia"),
  row("2026-09-10", "pes", 280000, "out", "Educação"),
  row("2026-09-12", "biz", 64018, "out", "Restaurante"),
  row("2026-09-20", "biz", 50000, "out", "Transferência", true),
  row("2026-09-20", "pes", 50000, "in", "Transferência", true),
];
const prevRows = [row("2026-08-05", "biz", 238500, "out", "Moradia"), row("2026-08-12", "biz", 105800, "out", "Restaurante"), row("2026-08-01", "biz", 600000, "in", "Salário")];
const cleared = [...rows, ...prevRows].map((r) => ({ account_id: r.account_id, date: r.date, amount_cents: r.amount_cents, direction: r.direction }));
const balances = accountBalancesInMonth({
  month: "2026-09",
  accounts: [
    { id: "biz", name: "Conta Empresa", card: false, openingCents: 0 },
    { id: "pes", name: "Conta Pessoal", card: false, openingCents: 10000 },
  ],
  cleared,
});
const bizM = balances.find((b) => b.id === "biz")!;
const pesM = balances.find((b) => b.id === "pes")!;
assert.equal(bizM.startCents, 600000 - 238500 - 105800);
assert.equal(bizM.endCents, bizM.startCents + 600000 - 238500 - 64018 - 50000);
// Pessoal: 10000 + 250000 (dia 3) − 280000 (dia 10) = −20000 do dia 10 ao 19; volta no 20.
assert.equal(pesM.negativeDays, 10);

const month = buildMonth({
  month: "2026-09",
  rows,
  prevRows,
  accounts: balances,
  goals: [
    { name: "Reserva", kind: "save", currentCents: 320000, targetCents: 1000000, progress: 0.32, monthCents: 40000, over: false },
    { name: "Restaurante até $600", kind: "limit", currentCents: 64018, targetCents: 60000, progress: 1.07, monthCents: 0, over: true },
  ],
  next: { outCents: 428619, inCents: 905000, count: 24 },
});
assert.equal(month.inCents, 850000, "transferência fora");
assert.equal(month.outCents, 238500 + 280000 + 64018);
const bizRow = month.accounts.find((a) => a.id === "biz")!;
assert.equal(bizRow.outCents, 238500 + 64018);
assert.equal(month.categories[0].name, "Educação");
assert.equal(month.categories.find((c) => c.name === "Restaurante")!.prevCents, 105800);
const monthly = renderMonthly(month, base);
assert.equal(monthly.subject, "Setembro fechou: sobrou $2,674.82");
assert.match(monthly.html, /Conta por conta/);
assert.match(monthly.html, /ficou negativa 10 dias/);
assert.match(monthly.html, /transferências/);
assert.match(monthly.html, /Passou \$40/);
assert.match(monthly.html, /relatorios\?month=2026-09/);
assert.doesNotMatch(monthly.html, /undefined|NaN/);
save("mes.html", monthly.html);

// --- Quando manda -----------------------------------------------------------
const all = { weekly: true, monthly: true, alerts: true };
assert.deepEqual(dueKinds("2026-10-19", all).map((k) => k.kind), ["weekly"], "segunda: resumo no lugar do aviso");
assert.deepEqual(dueKinds("2026-10-20", all).map((k) => k.kind), ["alerts"]);
assert.deepEqual(dueKinds("2026-10-20", { ...all, alerts: false }), []);
assert.deepEqual(dueKinds("2026-10-19", { ...all, weekly: false }).map((k) => k.kind), ["alerts"]);
assert.deepEqual(dueKinds("2026-12-01", all), [
  { kind: "monthly", period: "2026-11" },
  { kind: "alerts", period: "2026-12-01" },
]);
assert.deepEqual(dueKinds("2027-02-01", all).map((k) => k.kind), ["weekly", "monthly"], "segunda dia 1: resumo e fechamento");

// --- Convite e formatos -----------------------------------------------------
const invite = renderInvite({
  inviterName: "Ana",
  householdName: "Casa <Teste>",
  link: "https://velunapp.com/convite/abc",
  email: "bia@exemplo.com",
  expiresOn: "2026-10-24",
  siteUrl: "https://velunapp.com",
});
assert.match(invite.html, /Casa &lt;Teste&gt;/, "escapa o nome");
assert.match(invite.html, /sábado, 24\/10/);
save("convite.html", invite.html);

assert.equal(rangeLabel("2026-10-19", "2026-10-25"), "19 a 25 de outubro");
assert.equal(rangeLabel("2026-09-28", "2026-10-04"), "28 de setembro a 4 de outubro");
assert.equal(weekdayDate("2026-10-23"), "sexta, 23/10");
assert.equal(moneyShort(28200, "USD"), "$282");
assert.equal(moneyShort(128460, "USD"), "$1,284.60");
assert.equal(moneyShort(28200, "BRL").replace(/\s/g, " "), "R$ 282");

console.log("check-emails: ok");
