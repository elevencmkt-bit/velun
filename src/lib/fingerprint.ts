import { createHash } from "crypto";

// Seção 4.3 da spec: fingerprint = hash(account_id + date + amount_cents +
// descrição normalizada). Usado tanto na dedup de importação quanto no
// lançamento manual, para manter as duas origens comparáveis.
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function computeFingerprint(params: {
  accountId: string;
  date: string;
  amountCents: number;
  description: string;
}): string {
  const raw = [
    params.accountId,
    params.date,
    params.amountCents,
    normalizeDescription(params.description),
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}
