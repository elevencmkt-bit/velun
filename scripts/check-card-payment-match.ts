// Confere o reconhecimento de pagamento de fatura no extrato.
// Rodar: npx tsx scripts/check-card-payment-match.ts
import { matchCardPayments, type CardForMatch, type LineForMatch } from "../src/lib/import/match-card-payment";

let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "  ok   " : "  FALHA"} ${name}${ok ? "" : ` — veio ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`}`);
}

const CHECKING = "regions";
const card: CardForMatch = {
  id: "nomad-card",
  name: "Nomad Credit Card",
  institution: "Nomad",
  lastFour: "4821",
  paymentAccountId: CHECKING,
  statements: [
    { closing: "2026-09-28", due: "2026-10-22", totalCents: 128430, remainingCents: 128430, status: "closed" },
    { closing: "2026-10-28", due: "2026-11-22", totalCents: 5000, remainingCents: 5000, status: "open" },
  ],
};
const line = (over: Partial<LineForMatch>): LineForMatch => ({
  date: "2026-10-20",
  amountCents: 128430,
  direction: "out",
  description: "Online Payment",
  free: true,
  ...over,
});

eq("valor exato da fatura fechada, conta que paga: marcado", matchCardPayments(CHECKING, [line({})], [card], []), [
  { kind: "payment", cardId: "nomad-card", accepted: true, closing: "2026-09-28" },
]);
eq("antes do fechamento não é pagamento dessa fatura", matchCardPayments(CHECKING, [line({ date: "2026-09-20", description: "Amazon" })], [card], []), [null]);
eq("muito depois do vencimento não casa pelo valor", matchCardPayments(CHECKING, [line({ date: "2026-11-10", description: "Transfer" })], [card], []), [null]);
eq("parcial com cara de pagamento: sugerido desmarcado", matchCardPayments(CHECKING, [line({ amountCents: 50000, description: "Card Payment Nomad" })], [card], []), [
  { kind: "payment", cardId: "nomad-card", accepted: false, closing: null },
]);
eq("valor diferente sem cara de pagamento: nada", matchCardPayments(CHECKING, [line({ amountCents: 50000, description: "Publix" })], [card], []), [null]);
eq("entrada nunca é pagamento de fatura", matchCardPayments(CHECKING, [line({ direction: "in" })], [card], []), [null]);
eq("linha já usada (duplicata/previsão) fica de fora", matchCardPayments(CHECKING, [line({ free: false })], [card], []), [null]);
eq("já pago pelo app: duplicata", matchCardPayments(CHECKING, [line({})], [card], [{ date: "2026-10-18", amountCents: 128430 }]), [{ kind: "already-registered" }]);
eq("um pagamento registrado não cobre duas linhas", matchCardPayments(CHECKING, [line({}), line({ date: "2026-10-21" })], [card], [{ date: "2026-10-18", amountCents: 128430 }]).map((m) => m?.kind), ["already-registered", "payment"]);

const otherAccount = "nomad-checking";
eq("outra conta só casa se a descrição citar o cartão", matchCardPayments(otherAccount, [line({})], [card], []), [null]);
eq("…citando o final 4821", matchCardPayments(otherAccount, [line({ description: "Payment card 4821" })], [card], [])[0]?.kind, "payment");
eq("…citando o banco", matchCardPayments(otherAccount, [line({ description: "NOMAD PAYMENT" })], [card], [])[0]?.kind, "payment");

console.log(fail ? `\n${fail} FALHA(S)` : "\nTUDO PASSOU");
if (fail) process.exit(1);
