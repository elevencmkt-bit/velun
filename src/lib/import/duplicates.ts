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
