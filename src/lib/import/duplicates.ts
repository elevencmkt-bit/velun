// Duplicata por contagem, não por presença.
//
// Três saques de US$ 300 no mesmo dia têm a mesma impressão digital
// (conta + data + valor + texto do banco) e são três lançamentos de
// verdade. Se a conta já tem dois, o extrato traz o terceiro como novo.

export function duplicateCounter(existingFingerprints: Iterable<string>) {
  const left = new Map<string, number>();
  for (const fp of existingFingerprints) left.set(fp, (left.get(fp) ?? 0) + 1);
  /** true se essa linha já existe na conta (e "gasta" uma das existentes). */
  return function isDuplicate(fingerprint: string): boolean {
    const n = left.get(fingerprint) ?? 0;
    if (n === 0) return false;
    left.set(fingerprint, n - 1);
    return true;
  };
}

export type ExistingLine = {
  fingerprint: string;
  date: string;
  direction: string;
  amount_cents: number;
  status: string;
  import_id: string | null;
};

export type IncomingLine = { fingerprint: string; date: string; direction: string; amountCents: number };

const looseKey = (date: string, direction: string, cents: number) => `${date}|${direction}|${cents}`;

/**
 * Repetidos de um extrato (PDF ou arquivo) contra o que a conta já tem.
 *
 * O que já veio de OUTRA importação pode ter outro texto pro mesmo
 * lançamento: o print mostra o nome do app ("Stltones.Com") e o PDF o do
 * extrato ("STL Tones"); o OFX corta o nome em 32 letras; o CSV às vezes
 * traz outra descrição. Então o que veio de importação vale por dia +
 * valor + direção; o digitado à mão, só pela impressão digital (ali o
 * cruzamento é outro, com sugestão de junção).
 *
 * Uma linha existente só é "gasta" uma vez, e as exatas vêm primeiro:
 * senão uma linha solta poderia gastar a existente de uma exata mais
 * abaixo. Devolve, pra cada linha do extrato (na ordem), se é repetida.
 */
export function statementDuplicates(existing: ExistingLine[], incoming: IncomingLine[]): boolean[] {
  const strict = duplicateCounter(existing.map((t) => t.fingerprint));
  const imported = existing.filter((t) => t.status === "cleared" && t.import_id);
  const looseLeft = new Map<string, number>();
  for (const t of imported) {
    const k = looseKey(t.date, t.direction, t.amount_cents);
    looseLeft.set(k, (looseLeft.get(k) ?? 0) + 1);
  }
  const importedFp = new Set(imported.map((t) => t.fingerprint));
  const out = incoming.map((t) => {
    if (!strict(t.fingerprint)) return false;
    const k = looseKey(t.date, t.direction, t.amountCents);
    if (importedFp.has(t.fingerprint) && (looseLeft.get(k) ?? 0) > 0) looseLeft.set(k, (looseLeft.get(k) ?? 0) - 1);
    return true;
  });
  return out.map((exact, i) => {
    if (exact) return true;
    const t = incoming[i];
    const k = looseKey(t.date, t.direction, t.amountCents);
    const left = looseLeft.get(k) ?? 0;
    if (left === 0) return false;
    looseLeft.set(k, left - 1);
    return true;
  });
}
