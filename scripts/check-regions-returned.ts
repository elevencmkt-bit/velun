// Rodar: npx tsx scripts/check-regions-returned.ts
// Cheque/débito devolvido ("RETURNED CHECKS") é dinheiro que VOLTA pra conta.
import assert from "node:assert/strict";
import { parseRegionsStatementText } from "../src/lib/import/regions-pdf";
import { verifyStatement } from "../src/lib/import/verify";

// Extrato inventado, no formato que o leitor de PDF entrega (células por tab).
const text = [
  "LIFEGREEN EACCESS ACCOUNT",
  "August 23, 2024 through September 20, 2024",
  "SUMMARY",
  "Beginning Balance\t$100.00",
  "Deposits & Credits\t$50.00\t+",
  "Withdrawals\t$80.00\t-",
  "Fees\t$5.00\t-",
  "Returned Checks\t$80.00\t+",
  "Ending Balance\t$145.00",
  "DEPOSITS & CREDITS",
  "09/02\tZelle Credit From Fulano\t50.00",
  "WITHDRAWALS",
  "09/05\tCity Utility Payment\t80.00",
  "FEES",
  "09/10\tMonthly Fee\t5.00",
  "RETURNED CHECKS",
  "09/06\tCredit-Returned Ck#1234567890\t80.00",
  "DAILY BALANCE SUMMARY",
  "09/02\t150.00",
  "09/05\t70.00",
  "09/06\t150.00",
  "09/10\t145.00",
].join("\n");

const s = parseRegionsStatementText(text);
const returned = s.transactions.find((t) => t.description.startsWith("Credit-Returned"));
assert.ok(returned, "lê o cheque devolvido");
assert.equal(returned.direction, "in", "devolvido entra, não sai");
assert.equal(returned.amountCents, 8000);
assert.equal(s.transactions.find((t) => t.description === "Monthly Fee")?.direction, "out", "tarifa continua saída");
const v = verifyStatement(s);
assert.equal(v.matches, true, "o extrato fecha dia a dia");
console.log("check-regions-returned: ok");
