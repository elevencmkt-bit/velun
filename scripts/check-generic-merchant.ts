// Rodar: npx tsx scripts/check-generic-merchant.ts
import assert from "node:assert/strict";
import { isGenericBankText } from "../src/lib/import/clean-description";
import { merchantKey } from "../src/lib/merchant-categories";

for (const g of ["Zelle Credit", "Zelle Debit", "ZELLE PAYMENT", "Deposit", "Mobile Deposit", "Online Transfer", "ATM Withdrawal", "Pix enviado", "Transferência"]) {
  assert.equal(isGenericBankText(g), true, g);
  assert.equal(merchantKey(g), "", g);
}
for (const s of ["Zelle Credit From Fermiano LLC Ref# 618200k0eucx", "Publix", "Overdraft Fee", "Arena Snack Bar", "Netflix.com 10150341 9889"]) {
  assert.equal(isGenericBankText(s), false, s);
  assert.notEqual(merchantKey(s), "", s);
}
console.log("check-generic-merchant: ok");
