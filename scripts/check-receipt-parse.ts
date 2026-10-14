// Rodar: npx tsx scripts/check-receipt-parse.ts
// Textos inventados no formato que o reconhecimento devolve.
import assert from "node:assert/strict";
import { moneyToCents, parseReceipt } from "../src/lib/receipt-parse";

const US = { order: "mdy" as const, today: "2026-10-14" };
const BR = { order: "dmy" as const, today: "2026-10-14" };

assert.equal(moneyToCents("1,234.56"), 123456);
assert.equal(moneyToCents("1.234,56"), 123456);
assert.equal(moneyToCents("85,15"), 8515);
assert.equal(moneyToCents("47.83"), 4783);

// Recibo de mercado: total depois de subtotal e imposto; troco ignorado.
const publix = parseReceipt(
  `PUBLIX SUPER MARKETS
Store #1234  Orlando FL
BANANAS        1.29
MILK 1GAL      4.59
CHICKEN       38.50
SUBTOTAL      44.38
TAX            3.45
TOTAL         47.83
CASH          60.00
CHANGE        12.17
10/12/2026 14:31`,
  US,
);
assert.deepEqual(publix, { amountCents: 4783, date: "2026-10-12", merchant: "Publix Super Markets" });

// Print de Zelle: valor numa linha, destinatário em outra.
const zelle = parseReceipt(
  `Zelle
You sent
$1,700.00
to LUZ LOZANO
Oct 2, 2026
Confirmation 8XK2`,
  US,
);
assert.equal(zelle.amountCents, 170000);
assert.equal(zelle.date, "2026-10-02");
assert.equal(zelle.merchant, "Luz Lozano");

// Pix brasileiro: R$ e data dd/mm.
const pix = parseReceipt(
  `Comprovante de transferência
Pix enviado
Valor R$ 85,15
Para: Padaria Pão Quente Ltda
Data 05/10/2026 às 09:12`,
  US,
);
assert.equal(pix.amountCents, 8515);
assert.equal(pix.date, "2026-10-05", "R$ no texto → dd/mm");
assert.equal(pix.merchant, "Padaria Pão Quente Ltda");

// E-mail de pedido: "Order Total".
const amazon = parseReceipt(
  `Your Amazon.com order
Order #112-3344
Items: $19.99
Shipping: $0.00
Estimated tax: $1.40
Order Total: $21.39
Ordered on October 9, 2026`,
  US,
);
assert.equal(amazon.amountCents, 2139);
assert.equal(amazon.date, "2026-10-09");

// Sem palavra "total": maior valor; data ambígua segue o país.
const loose = parseReceipt(`Joe's Tacos\n2 tacos 7.50\n1 drink 2.25\n9.75\n03/04/2026`, BR);
assert.equal(loose.amountCents, 975);
assert.equal(loose.date, "2026-04-03");
assert.equal(loose.merchant, "Joe's Tacos");

// Nada reconhecível: tudo em branco, sem inventar.
assert.deepEqual(parseReceipt("~~ ### ~~", US), { amountCents: null, date: null, merchant: null });
// Data no futuro distante é ignorada.
assert.equal(parseReceipt("Total 10.00\n12/25/2030", US).date, null);

console.log("check-receipt-parse: ok");
