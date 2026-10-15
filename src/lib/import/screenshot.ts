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
  /** Na seção "Pending" do app: ainda não foi lançado pelo banco. */
  pending?: boolean;
};

export type ReconciledRow = {
  date: string;
  description: string;
  /** Com sinal: negativo é saída. */
  amountCents: number;
  balanceCents: number | null;
  /** O valor lido foi corrigido pela corrente de saldos. */
  corrected: boolean;
  /** O valor fecha com o saldo da linha de baixo (dá pra confiar). */
  checked: boolean;
  pending: boolean;
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
  // primeiro dígito pode ser o "$" (ou "-$") mal lido. Com o "$" lido,
  // ainda pode ser o "-" que virou 5, 3 ou 8 ("$520.00" era "-$20.00").
  const firstLooksLikeSign = /^[358]/.test(digits);
  if (digits.length >= 2 && (!hasDollar || firstLooksLikeSign)) {
    const alt = Number(digits.slice(1)) * 100 + Number(m[4]);
    const cost = (hasDollar ? 2 : 1.5) * unsure;
    out.push({ cents: -alt, cost }, { cents: alt, cost });
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

/** "Projected available balance -$85.17": rótulo de saldo no topo do app, não é lançamento. */
const BALANCE_LABEL =
  /\b(?:projected|available|current|ledger|pending|total)\s+(?:available\s+)?balance\b|^(?:available\s+)?balance$|\bsaldo\s+(?:dispon[ií]vel|projetado|previsto|atual|em\s+conta)\b|^saldo$/i;
/** Cabeçalho da seção de lançamentos que o banco ainda não lançou. */
const PENDING = /^(?:pending|pendentes?|processing)$/i;

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

  // O texto à esquerda, na mesma altura de uma palavra.
  const leftOf = (m: OcrWord) => {
    const h = m.y1 - m.y0;
    const cy = (m.y0 + m.y1) / 2;
    return words
      .filter((w) => w.x1 < m.x0 && Math.abs((w.y0 + w.y1) / 2 - cy) < h * 0.6)
      .sort((a, b) => a.x0 - b.x0)
      .map((w) => w.text)
      .join(" ");
  };

  // Valores: coluna da direita, fora os rótulos de saldo do topo.
  const money = words
    .filter((w) => w.x0 > W * 0.5)
    .map((w) => ({ w, m: readMoney(w.text, w.confidence) }))
    .filter((x): x is { w: OcrWord; m: Money } => x.m !== null)
    .filter((x) => !BALANCE_LABEL.test(leftOf(x.w)));

  // Cabeçalhos à esquerda: datas e a seção "Pending".
  const headers = words
    .filter((w) => w.x0 < W * 0.4)
    .map((w) => ({ w, iso: readDate(w.text), pending: PENDING.test(w.text.trim()) }))
    .filter((x) => x.iso !== null || x.pending);

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

    const header = [...headers].reverse().find((d) => d.w.y1 <= a.w.y0 + h * 0.2);
    rows.push({
      date: header?.iso ?? null,
      description: desc,
      amount: a.m,
      balance: bal?.m ?? null,
      pending: header?.pending ?? false,
    });
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
  // O fim do nome às vezes some (a seta ">" do app fica colada): com o
  // saldo, o começo do nome basta.
  if (r.balance) return `${name.slice(0, 5)}|b${digits(r.balance)}`;
  const a = digits(r.amount);
  return `${name}|a${a.length > 3 ? a.slice(-4) : a}`;
}

/**
 * Junta várias imagens (rolando a tela, uma pega o fim da outra) numa
 * lista só, do mais novo pro mais antigo, sem repetir o trecho em comum.
 */
export function mergeScreens(screens: ScreenRow[][]): { rows: ScreenRow[]; undated: number } {
  // Mais nova primeiro: a que tem "Pending" (fica no topo da lista do
  // app), depois pela data mais recente que aparece em cada uma.
  const newest = (rows: ScreenRow[]) => rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), "");
  const hasPending = (rows: ScreenRow[]) => (rows.some((r) => r.pending) ? 1 : 0);
  const ordered = screens
    .map((rows, i) => ({ rows, i }))
    .sort(
      (a, b) =>
        hasPending(b.rows) - hasPending(a.rows) || newest(b.rows).localeCompare(newest(a.rows)) || a.i - b.i,
    )
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
    const last = out.length > 0 ? out[out.length - 1] : null;
    for (const r of rows.slice(overlap)) {
      const header = r.date !== null || r.pending;
      out.push({ ...r, date: header ? r.date : (last?.date ?? null), pending: header ? r.pending : (last?.pending ?? false) });
    }
  }
  const undated = out.filter((r) => !r.date && !r.pending).length;
  return { rows: out.filter((r) => r.date || r.pending), undated };
}

/**
 * Escolhe, pra cada linha, a leitura (valor e saldo) que fecha a conta
 * saldo_i = saldo_(i+1) + valor_i, mudando o mínimo do que foi lido.
 * Linhas do mais novo pro mais antigo. A conferência é por trecho: uma
 * linha sem saldo não impede de conferir as outras.
 */
export function reconcile(rows: ScreenRow[], openingCents?: number): ReconciledRow[] {
  const out: ReconciledRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!rows[i].balance) {
      out.push(asRead(rows[i]));
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].balance) j++;
    // O trecho que chega na linha mais antiga confere ela com o saldo que
    // o Velun já tem antes dela (quando foi passado).
    out.push(...reconcileRun(rows.slice(i, j), j === rows.length ? openingCents : undefined));
    i = j;
  }
  return out;
}

/** Sem saldo pra conferir: vale o que foi lido. */
function asRead(r: ScreenRow): ReconciledRow {
  return {
    date: r.date ?? "",
    description: r.description,
    amountCents: r.amount.candidates[0].cents,
    balanceCents: r.balance ? r.balance.candidates[0].cents : null,
    corrected: false,
    checked: false,
    pending: r.pending ?? false,
  };
}

/** Um trecho em que todas as linhas têm saldo. */
function reconcileRun(rows: ScreenRow[], openingCents?: number): ReconciledRow[] {
  const n = rows.length;
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
        // A mais antiga só confere com o saldo que o Velun tem antes dela.
        // Sem isso (ou se não fecha), vale o valor lido.
        let best = { a: 0, cost: bals[b].cost };
        if (openingCents !== undefined) {
          for (let a = 0; a < amts.length; a++) {
            const fits = bals[b].cents === openingCents + amts[a].cents;
            const cost = bals[b].cost + amts[a].cost + (fits ? 0 : BREAK);
            if (a === 0 || cost < best.cost) best = { a, cost };
          }
        }
        dp[i][b] = best.cost;
        choice[i][b] = { a: best.a, nb: -1 };
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
    const below = nb >= 0 ? rows[i + 1].balance!.candidates[nb].cents : openingCents;
    const checked = below !== undefined && balance.cents === below + amount.cents;
    out.push({
      date: rows[i].date ?? "",
      description: rows[i].description,
      amountCents: amount.cents,
      balanceCents: balance.cents,
      corrected: a !== 0 || b !== 0,
      checked,
      pending: rows[i].pending ?? false,
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
export function screensToStatement(
  screens: OcrScreen[],
  /** Saldo que o Velun tem antes do lançamento mais antigo: confere o mais antigo. */
  openingCents?: number,
): {
  statement: ParsedStatement;
  hasBalances: boolean;
  corrected: number;
  undated: number;
  /** Na seção "Pending": ficam de fora até o banco lançar. */
  pending: number;
  /** Linhas cujo valor não deu pra conferir pelo saldo (do mais novo pro mais antigo). */
  unchecked: { date: string; description: string; amountCents: number }[];
} {
  const { rows, undated } = mergeScreens(screens.map(rowsFromScreen));
  // Os pendentes entram na conferência (o saldo deles emenda com o resto)
  // mas não na importação: o banco ainda pode mudar valor e data, e o
  // lançamento de verdade vem no próximo print ou extrato.
  const all = reconcile(rows, openingCents);
  const reconciled = all.filter((r) => !r.pending);
  const { statement, hasBalances } = toStatement(reconciled);
  return {
    statement,
    hasBalances,
    corrected: reconciled.filter((r) => r.corrected).length,
    undated,
    pending: all.length - reconciled.length,
    unchecked: reconciled
      .filter((r) => !r.checked)
      .map((r) => ({ date: r.date, description: r.description, amountCents: r.amountCents })),
  };
}
