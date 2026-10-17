// Rodar: npx tsx scripts/check-recurrence-edit.ts
import assert from "node:assert/strict";
import { describeSchedule, generateOccurrenceDates, recurrenceScopes } from "../src/lib/recurrence";

assert.equal(describeSchedule({ frequency: "weekly", startsOn: "2026-10-23", dayOfMonth: null }), "toda sexta");
assert.equal(describeSchedule({ frequency: "weekly", startsOn: "2026-10-24", dayOfMonth: null }), "todo sábado");
assert.equal(describeSchedule({ frequency: "monthly", startsOn: "2026-07-21", dayOfMonth: 21 }), "todo dia 21");
assert.equal(describeSchedule({ frequency: "monthly", startsOn: "2026-07-31", dayOfMonth: null }), "todo dia 31");
assert.equal(describeSchedule({ frequency: "yearly", startsOn: "2027-03-05", dayOfMonth: null }), "todo ano em 05/03");

// Só data ou nota mudou: não pergunta (vale só pra este).
assert.deepEqual(recurrenceScopes({ amount: false, direction: false, description: false, category: false }), { ask: false, allowAll: false });
// Nome/categoria: pode ir pra todos, inclusive os passados.
assert.deepEqual(recurrenceScopes({ amount: false, direction: false, description: true, category: false }), { ask: true, allowAll: true });
// Valor: só este ou este e os próximos.
assert.deepEqual(recurrenceScopes({ amount: true, direction: false, description: true, category: false }), { ask: true, allowAll: false });

// Próximas a partir de uma data nova (o que o "Editar recorrência" mostra).
assert.deepEqual(
  generateOccurrenceDates({ frequency: "weekly", startsOn: "2026-10-23", dayOfMonth: null, endsOn: null, count: 3, from: "2026-10-17" }),
  ["2026-10-23", "2026-10-30", "2026-11-06"],
);
assert.deepEqual(
  generateOccurrenceDates({ frequency: "monthly", startsOn: "2026-10-21", dayOfMonth: 21, endsOn: "2026-11-30", count: 3, from: "2026-10-17" }),
  ["2026-10-21", "2026-11-21"],
  "para no fim",
);

console.log("check-recurrence-edit: ok");
