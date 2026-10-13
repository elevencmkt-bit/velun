// Data no formato brasileiro (dd/mm/aaaa) <-> ISO (aaaa-mm-dd).
// Puro, pra testar sem navegador.

/** "2026-10-13" → "13/10/2026"; vazio ou inválido → "". */
export function isoToBr(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Vai pondo as barras enquanto a pessoa digita: "1310" → "13/10". */
export function maskBr(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * "13/10/2026" → "2026-10-13". Devolve null se incompleta ou se o dia
 * não existe (31/02, 29/02 fora de bissexto).
 */
export function brToIso(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2200) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
