// Importar por PRINT da lista de lançamentos do app do banco.
//
// Puro: entra a lista de palavras que o reconhecimento achou em cada
// imagem (texto + caixa + confiança), sai um ParsedStatement igual ao dos
// PDFs — e daí em diante é a mesma importação (revisão, repetidos,
// previsões, memória de categoria).
//
// O que torna isso confiável é o SALDO que o app mostra embaixo de cada
// valor (Regions faz assim): saldo_desta = saldo_da_anterior + valor. A
// leitura de imagem erra coisas pequenas e decisivas — some o sinal de
// menos, "-$4.21" vira "54.21", "$100.00" vira "3100.00" —, e a corrente
// de saldos diz qual leitura é a certa. Sem saldo, vale o que foi lido e
// a conferência fica "sem como conferir".

import type { ParsedStatement, ParsedTransaction } from "./regions-pdf";

export type OcrWord = {
  text: string;
  /** 0–100 */
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OcrScreen = { width: number; height: number; words: OcrWord[] };

/** Um valor como foi lido, com as leituras alternativas plausíveis. */
type Money = {
  raw: string;
  /** Valores com sinal (centavos) que esse texto pode ser, do mais provável ao menos. */
  candidates: { cents: number; cost: number }[];
};

export type ScreenRow = {
  date: string | null;
  description: string;
  amount: Money;
  balance: Money | null;
};

export type ReconciledRow = {
  date: string;
  description: string;
  /** Com sinal: negativo é saída. */
  amountCents: number;
  balanceCents: number | null;
  /** O valor lido foi corrigido pela corrente de saldos. */
  corrected: boolean;
};

const MONEY_RE = /^(-)?\s*(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})$/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

function cleanToken(t: string): string {
  return t.replace(/^[^\d$-]+/, "").replace(/[^\d]+$/, "");
}

function readMoney(text: string, confidence: number): Money | null {
  const t = cleanToken(text.replace(/[—–]/g, "-"));
  const m = t.match(MONEY_RE);
  if (!m) return null;
  const negative = Boolean(m[1]);
  const hasDollar = Boolean(m[2]);
  const digits = m[3].replace(/,/g, "");
  const abs = Number(digits) * 100 + Number(m[4]);
  const unsure = confidence < 60 ? 0.5 : 1;
  const out: { cents: number; cost: number }[] = [
    { cents: negative ? -abs : abs, cost: 0 },
    { cents: negative ? abs : -abs, cost: 1 * unsure },
  ];
  // "-$4.21" lido como "54.21", "$100.00" como "3100.00": sem o "$", o
  // primeiro dígito pode ser o "$" (ou "-$") mal lido.
  if (!hasDollar && digits.length >= 2) {
    const alt = Number(digits.slice(1)) * 100 + Number(m[4]);
    out.push({ cents: -alt, cost: 1.5 * unsure }, { cents: alt, cost: 1.5 * unsure });
  }
  return { raw: text, candidates: out };
}

function readDate(text: string): string | null {
  const m = cleanToken(text).match(DATE_RE) ?? text.match(DATE_RE);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const JUNK = /^[^A-Za-zÀ-ÿ0-9]*$/;

/** Palavras na ordem de leitura: agrupa por linha (caixas com alturas um
 * pouco diferentes contam como a mesma linha) e lê da esquerda pra direita. */
function inReadingOrder(words: OcrWord[], lineHeight: number): OcrWord[] {
  const cy = (w: OcrWord) => (w.y0 + w.y1) / 2;
  const sorted = [...words].sort((a, b) => cy(a) - cy(b));
  const lines: OcrWord[][] = [];
  for (const w of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(cy(w) - cy(line[0])) < lineHeight * 0.5) line.push(w);
    else lines.push([w]);
  }
  return lines.flatMap((l) => l.sort((a, b) => a.x0 - b.x0));
}

/** As linhas de lançamento de UMA imagem, de cima pra baixo. */
export function rowsFromScreen(screen: OcrScreen): ScreenRow[] {
  const W = screen.width;
  const words = [...screen.words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // Valores: coluna da direita.
  const money = words
    .filter((w) => w.x0 > W * 0.5)
    .map((w) => ({ w, m: readMoney(w.text, w.confidence) }))
    .filter((x): x is { w: OcrWord; m: Money } => x.m !== null);

  // Datas: cabeçalhos à esquerda.
  const dates = words
    .filter((w) => w.x0 < W * 0.4)
    .map((w) => ({ w, iso: readDate(w.text) }))
    .filter((x): x is { w: OcrWord; iso: string } => x.iso !== null);

  const rows: ScreenRow[] = [];
  for (let i = 0; i < money.length; i++) {
    const a = money[i];
    const h = a.w.y1 - a.w.y0;
    // O saldo vem logo abaixo, alinhado à direita, em letra menor.
    const next = money[i + 1];
    const isBalance =
      next &&
      next.w.y0 - a.w.y1 < h * 1.6 &&
      next.w.y0 > a.w.y0 + h * 0.5 &&
      Math.abs(next.w.x1 - a.w.x1) < W * 0.06;
    const bal = isBalance ? next : null;
    if (bal) i++;

    const top = a.w.y0 - h * 0.6;
    const bottom = (bal ? bal.w.y1 : a.w.y1) + h * 0.3;
    const descWords = words
      .filter((w) => w.x1 < W * 0.62)
      .filter((w) => {
        const cy = (w.y0 + w.y1) / 2;
        return cy >= top && cy <= bottom;
      })
      .filter((w) => !readDate(w.text) && !JUNK.test(w.text))
      .filter((w) => !(w.confidence < 60 && w.text.length <= 3));
    // Sujeira desenhada por cima de outra palavra ("Apple" + "PP"): fica a maior.
    const inside = (w: OcrWord, v: OcrWord) => v !== w && v.x0 <= w.x0 && v.x1 >= w.x1 && v.y0 < w.y1 && w.y0 < v.y1;
    const descWordsClean = descWords.filter((w) => !descWords.some((v) => inside(w, v)));
    const desc = inReadingOrder(descWordsClean, h).map((w) => w.text).join(" ").trim();

    const header = [...dates].reverse().find((d) => d.w.y1 <= a.w.y0 + h * 0.2);
    rows.push({ date: header?.iso ?? null, description: desc, amount: a.m, balance: bal?.m ?? null });
  }
  return rows.filter((r) => r.description.length > 0);
}

/** Só os dígitos do valor: "-$9.99", "$9.99" e "39.99" (o "-$" lido como 3) dão "999"/"3999". */
const digits = (m: Money) => m.raw.replace(/\D/g, "");

/**
 * Chave pra achar a mesma linha em dois prints. A mesma linha pode ser
 * lida diferente em cada print ("-$9.99" num, "39.99" no outro), então
 * a chave usa o nome e os dígitos do SALDO, que é único na lista; sem
 * saldo, os dígitos do valor sem o primeiro caractere duvidoso.
 */
function rowKey(r: ScreenRow): string {
  const name = r.description.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (r.balance) return `${name}|b${digits(r.balance)}`;
  const a = digits(r.amount);
  return `${name}|a${a.length > 3 ? a.slice(-4) : a}`;
}

/**
 * Junta várias imagens (rolando a tela, uma pega o fim da outra) numa
 * lista só, do mais novo pro mais antigo, sem repetir o trecho em comum.
 */
export function mergeScreens(screens: ScreenRow[][]): { rows: ScreenRow[]; undated: number } {
  // Mais nova primeiro (pela data mais recente que aparece em cada uma).
  const newest = (rows: ScreenRow[]) => rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), "");
  const ordered = screens
    .map((rows, i) => ({ rows, i }))
    .sort((a, b) => newest(b.rows).localeCompare(newest(a.rows)) || a.i - b.i)
    .map((s) => s.rows);

  const out: ScreenRow[] = [];
  for (const rows of ordered) {
    // Maior trecho em que o fim do que já temos é o começo desta imagem.
    let overlap = 0;
    for (let k = Math.min(out.length, rows.length); k > 0; k--) {
      let same = true;
      for (let j = 0; j < k; j++) {
        if (rowKey(out[out.length - k + j]) !== rowKey(rows[j])) {
          same = false;
          break;
        }
      }
      if (same) {
        overlap = k;
        break;
      }
    }
    // Linhas acima do primeiro cabeçalho de data são do último dia da
    // imagem anterior (a lista vem do mais novo pro mais antigo).
    const carry = out.length > 0 ? out[out.length - 1].date : null;
    for (const r of rows.slice(overlap)) out.push({ ...r, date: r.date ?? carry });
  }
  const undated = out.filter((r) => !r.date).length;
  return { rows: out.filter((r) => r.date), undated };
}

/**
 * Escolhe, pra cada linha, a leitura (valor e saldo) que fecha a conta
 * saldo_i = saldo_(i+1) + valor_i, mudando o mínimo do que foi lido.
 * Linhas do mais novo pro mais antigo.
 */
export function reconcile(rows: ScreenRow[]): ReconciledRow[] {
  const n = rows.length;
  if (n === 0) return [];
  // Sem saldo em alguma linha: vale o que foi lido.
  if (rows.some((r) => !r.balance)) {
    return rows.map((r) => ({
      date: r.date as string,
      description: r.description,
      amountCents: r.amount.candidates[0].cents,
      balanceCents: r.balance ? r.balance.candidates[0].cents : null,
      corrected: false,
    }));
  }

  const BREAK = 50;
  // dp[i][b]: menor custo da linha i até a mais antiga, com o saldo da
  // linha i escolhido como o candidato b.
  const dp: number[][] = rows.map((r) => r.balance!.candidates.map(() => Infinity));
  const choice: { a: number; nb: number }[][] = rows.map((r) => r.balance!.candidates.map(() => ({ a: 0, nb: -1 })));

  for (let i = n - 1; i >= 0; i--) {
    const bals = rows[i].balance!.candidates;
    const amts = rows[i].amount.candidates;
    for (let b = 0; b < bals.length; b++) {
      if (i === n - 1) {
        // A mais antiga não tem com quem conferir: vale o valor lido.
        dp[i][b] = bals[b].cost;
        choice[i][b] = { a: 0, nb: -1 };
        continue;
      }
      const nextBals = rows[i + 1].balance!.candidates;
      let best = Infinity;
      let pick = { a: 0, nb: 0 };
      for (let a = 0; a < amts.length; a++) {
        for (let nb = 0; nb < nextBals.length; nb++) {
          const fits = bals[b].cents === nextBals[nb].cents + amts[a].cents;
          const cost = bals[b].cost + amts[a].cost + (fits ? 0 : BREAK) + dp[i + 1][nb];
          if (cost < best) {
            best = cost;
            pick = { a, nb };
          }
        }
      }
      dp[i][b] = best;
      choice[i][b] = pick;
    }
  }

  let b = dp[0].indexOf(Math.min(...dp[0]));
  const out: ReconciledRow[] = [];
  for (let i = 0; i < n; i++) {
    const { a, nb } = choice[i][b];
    const amount = rows[i].amount.candidates[a];
    const balance = rows[i].balance!.candidates[b];
    out.push({
      date: rows[i].date as string,
      description: rows[i].description,
      amountCents: amount.cents,
      balanceCents: balance.cents,
      corrected: a !== 0 || b !== 0,
    });
    b = nb < 0 ? 0 : nb;
  }
  return out;
}

/** Linhas conferidas → o mesmo formato dos extratos em PDF. */
export function toStatement(rows: ReconciledRow[]): {
  statement: ParsedStatement;
  hasBalances: boolean;
} {
  // Do mais antigo pro mais novo, como no extrato.
  const asc = [...rows].reverse();
  const transactions: ParsedTransaction[] = asc.map((r) => ({
    date: r.date,
    description: r.description,
    amountCents: Math.abs(r.amountCents),
    direction: r.amountCents >= 0 ? "in" : "out",
    mcc: null,
  }));
  const hasBalances = rows.length > 0 && rows.every((r) => r.balanceCents !== null);
  const oldest = asc[0];
  const newest = rows[0];
  const beginning = hasBalances && oldest ? (oldest.balanceCents as number) - oldest.amountCents : 0;
  const ending = hasBalances && newest ? (newest.balanceCents as number) : 0;
  // Saldo ao fim de cada dia: o da linha mais nova daquele dia.
  const daily = new Map<string, number>();
  if (hasBalances) for (const r of rows) if (!daily.has(r.date)) daily.set(r.date, r.balanceCents as number);
  const dates = asc.map((r) => r.date);
  return {
    statement: {
      periodStart: dates[0] ?? "",
      periodEnd: dates[dates.length - 1] ?? "",
      beginningBalanceCents: beginning,
      endingBalanceCents: ending,
      transactions,
      dailyBalances: [...daily.entries()].map(([date, balanceCents]) => ({ date, balanceCents })).sort((x, y) => x.date.localeCompare(y.date)),
    },
    hasBalances,
  };
}

/** Do reconhecimento de várias imagens até o extrato pronto pra revisar. */
export function screensToStatement(screens: OcrScreen[]): {
  statement: ParsedStatement;
  hasBalances: boolean;
  corrected: number;
  undated: number;
} {
  const { rows, undated } = mergeScreens(screens.map(rowsFromScreen));
  const reconciled = reconcile(rows);
  const { statement, hasBalances } = toStatement(reconciled);
  return { statement, hasBalances, corrected: reconciled.filter((r) => r.corrected).length, undated };
}
