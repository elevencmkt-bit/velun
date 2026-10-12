// Confere a frase "o que fica de olho" do Fluxo de caixa.
import assert from "node:assert/strict";
import { buildCashFlowNote, type CashFlowPoint } from "../src/lib/cash-flow";

const fmt = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
const pt = (date: string, bal: number, ev: CashFlowPoint["events"] = []): CashFlowPoint => ({ date, label: date, balance_cents: bal, events: ev });

// Negativo hoje, volta com uma entrada e não cai mais.
let note = buildCashFlowNote({
  points: [pt("2026-10-12", -3098), pt("2026-10-13", -3098), pt("2026-10-16", 156902, [{ id: "a", type: "income", label: "Will Business", amount_cents: 160000 }]), pt("2026-10-20", 100000)],
  upcomingEvents: [],
  formatMoney: fmt,
});
assert.match(note, /^O saldo está negativo até 16 de outubro, quando entra Will Business, de \$1600\.00\. Depois disso, não volta/);

// Sempre positivo: cita a maior saída.
note = buildCashFlowNote({
  points: [pt("2026-10-12", 1000), pt("2026-10-13", 500)],
  upcomingEvents: [
    { id: "x", date: "2026-10-13", description: "Aluguel", direction: "out", amount_cents: 500, category_name: null },
    { id: "y", date: "2026-10-14", description: "Luz", direction: "out", amount_cents: 100, category_name: null },
  ],
  formatMoney: fmt,
});
assert.match(note, /positivo o período todo. A maior saída prevista é Aluguel/);

// Termina negativo.
note = buildCashFlowNote({ points: [pt("2026-10-12", 100), pt("2026-10-13", -200)], upcomingEvents: [], formatMoney: fmt });
assert.match(note, /termina o período no negativo \(-\$2\.00\)/);

// Com atrasados: usa o valor alternativo.
note = buildCashFlowNote({
  points: [{ ...pt("2026-10-12", 1000), with_overdue_cents: -500 }, { ...pt("2026-10-13", 1000), with_overdue_cents: -500 }],
  upcomingEvents: [],
  formatMoney: fmt,
  value: (p) => p.with_overdue_cents ?? p.balance_cents,
});
assert.match(note, /termina o período no negativo/);

console.log("check-cash-flow-note: ok");
