// Leitura de recibo ou print: do TEXTO reconhecido na imagem (o
// reconhecimento roda no navegador) tira o total, a data e o nome da
// loja. Puro, pra testar sem imagem. O que não achar fica em branco:
// melhor um campo vazio do que um valor inventado.

export type ReceiptGuess = {
  amountCents: number | null;
  /** aaaa-mm-dd */
  date: string | null;
  merchant: string | null;
};

const MONEY = /(?:US\$|R\$|\$|USD|BRL)?\s*(-?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;

/** "1,234.56", "1.234,56", "85,15", "47.83" → centavos. */
export function moneyToCents(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(/^-/, "");
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (lastSep < 0) return null;
  const int = s.slice(0, lastSep).replace(/[.,]/g, "");
  const dec = s.slice(lastSep + 1);
  if (dec.length !== 2 || !/^\d+$/.test(int + dec)) return null;
  const cents = Number(int) * 100 + Number(dec);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(MONEY)) {
    const c = moneyToCents(m[1]);
    if (c !== null) out.push(c);
  }
  return out;
}

const TOTAL_WORDS =
  /\b(grand\s*total|total\s*(?:due|amount|paid|a\s*pagar|pago|geral)?|amount(?:\s*(?:paid|sent|due|charged))?|valor(?:\s*(?:total|pago|da\s*transa[cç][aã]o|enviado))?|you\s*(?:sent|paid)|voc[eê]\s*(?:enviou|pagou)|payment\s*amount|order\s*total|balance\s*due)\b/i;
const NOT_TOTAL = /\b(sub\s*-?\s*total|tax|imposto|tip|gorjeta|change|troco|desconto|discount|savings|saved|you\s*saved|economia|points|cash\s*back|limite|available|dispon[ií]vel|saldo)\b/i;

function findAmount(lines: string[]): number | null {
  // 1º: linha com "total"/"amount"/"valor" (e sem subtotal, imposto...).
  // O valor pode estar na própria linha ou na seguinte (prints de app).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!TOTAL_WORDS.test(line) || NOT_TOTAL.test(line)) continue;
    const here = amountsIn(line);
    if (here.length > 0) return here[here.length - 1];
    const next = lines[i + 1] ? amountsIn(lines[i + 1]) : [];
    if (next.length > 0) return next[0];
  }
  // 2º: o maior valor da imagem, fora as linhas de troco, imposto etc.
  const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn);
  return all.length > 0 ? Math.max(...all) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, janeiro: 1,
  feb: 2, february: 2, fev: 2, fevereiro: 2,
  mar: 3, march: 3, marco: 3, "março": 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mai: 5, maio: 5,
  jun: 6, june: 6, junho: 6,
  jul: 7, july: 7, julho: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, set: 9, setembro: 9,
  oct: 10, october: 10, out: 10, outubro: 10,
  nov: 11, november: 11, novembro: 11,
  dec: 12, december: 12, dez: 12, dezembro: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findDate(text: string, order: "mdy" | "dmy", today: string): string | null {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const m of lower.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) found.push(v);
  }
  for (const m of lower.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    // Sem dúvida quando um dos dois passa de 12; senão, a ordem do país.
    const dmy = a > 12 ? true : b > 12 ? false : order === "dmy";
    const v = dmy ? iso(y, b, a) : iso(y, a, b);
    if (v) found.push(v);
  }
  // "Oct 12, 2026", "October 12 2026"
  for (const m of lower.matchAll(/\b([a-zç]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1]];
    if (mo) {
      const v = iso(+m[3], mo, +m[2]);
      if (v) found.push(v);
    }
  }
  // "12 Oct 2026", "12 de out. de 2026", "12 de outubro de 2026"
  for (const m of lower.matchAll(/\b(\d{1,2})\s+(?:de\s+)?([a-zç]{3,9})\.?\s+(?:de\s+)?(\d{4})\b/g)) {
    const mo = MONTHS[m[2]];
    if (mo) {
      const v = iso(+m[3], mo, +m[1]);
      if (v) found.push(v);
    }
  }

  // Data plausível: até amanhã e não mais que 2 anos atrás.
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 1);
  const min = new Date(`${today}T00:00:00Z`);
  min.setUTCFullYear(min.getUTCFullYear() - 2);
  const ok = found.filter((d) => {
    const t = new Date(`${d}T00:00:00Z`).getTime();
    return t <= max.getTime() && t >= min.getTime();
  });
  return ok[0] ?? null;
}

const RECIPIENT =
  /^(?:.*\b(?:sent\s+to|paid\s+to|to|para|recipient|destinat[aá]rio|favorecido|merchant|estabelecimento|loja)\b\s*:?\s*)(.+)$/i;
const SKIP_LINE =
  /(receipt|recibo|comprovante|welcome|bem[\s-]?vindo|thank|obrigad|store\s*#|loja\s*#|tel|phone|www\.|http|\.com|cnpj|cpf|transaction|transa[cç][aã]o|order|pedido|date|data|time|hora|confirmation|confirma[cç][aã]o|payment|pagamento|zelle|pix|^\W*$)/i;

function cleanName(s: string): string | null {
  const t = s
    .replace(/[|*_#~<>{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.,:;-]+$/, "")
    .trim();
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3 || letters.length < t.replace(/\s/g, "").length * 0.6) return null;
  // Tudo maiúsculo vira "Assim"; o resto fica como veio.
  const out =
    t === t.toUpperCase()
      ? t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
      : t;
  return out.slice(0, 60);
}

function findMerchant(lines: string[]): string | null {
  // Print de transferência: "Sent to Luz Lozano", "Para: Maria".
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RECIPIENT);
    if (!m) continue;
    const name = cleanName(m[1]) ?? (lines[i + 1] ? cleanName(lines[i + 1]) : null);
    if (name && amountsIn(name).length === 0) return name;
  }
  // Recibo: o nome da loja costuma ser a primeira linha de verdade.
  for (const line of lines.slice(0, 6)) {
    if (SKIP_LINE.test(line) || amountsIn(line).length > 0) continue;
    const name = cleanName(line);
    if (name) return name;
  }
  return null;
}

export function parseReceipt(
  text: string,
  options: { order: "mdy" | "dmy"; today: string },
): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // R$ no texto: data brasileira (dd/mm), seja qual for o país da casa.
  const order = /R\$|BRL/.test(text) ? "dmy" : options.order;
  return {
    amountCents: findAmount(lines),
    date: findDate(text, order, options.today),
    merchant: findMerchant(lines),
  };
}
