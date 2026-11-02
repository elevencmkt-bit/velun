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
  /** Escrita em verde no print (o app pinta entrada de verde). Sem a informação: ausente. */
  green?: boolean;
};

export type OcrScreen = { width: number; height: number; words: OcrWord[] };

/** Um valor como foi lido, com as leituras alternativas plausíveis. */
type Money = {
  raw: string;
  /** A cor do valor no print, quando dá pra saber: verde é entrada. */
  green?: boolean;
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
  /**
   * Linha com nome e sem valor legível (o leitor fez uma caixa só do
   * valor e do saldo e não entendeu nada). O valor sai da conta dos
   * saldos vizinhos, quando dá.
   */
  unread?: boolean;
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
  /** Cor do valor no print (verde é entrada), quando se sabe. */
  green?: boolean;
};

// O separador dos centavos às vezes vem lido como vírgula ("51,34"): com
// dois dígitos depois, é centavo (milhar tem três).
const MONEY_RE = /^(-)?\s*(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})$/;
// Sem o ponto ("-$16.80" lido como "31680", "-$10.27" como "1027"): os
// dois últimos dígitos são os centavos. Só número solto na beirada
// direita (a coluna dos valores), de 3 a 6 dígitos.
const MONEY_NO_POINT_RE = /^(-)?\s*(\$)?\s*(\d{1,4})(\d{2})$/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

function cleanToken(t: string): string {
  return t.replace(/^[^\d$-]+/, "").replace(/[^\d]+$/, "");
}

function readMoney(text: string, confidence: number, green?: boolean, allowNoPoint = false): Money | null {
  const t = cleanToken(text.replace(/[—–]/g, "-"));
  const pointed = t.match(MONEY_RE);
  // Sem ponto só quando não há separador nenhum no que foi lido: "100."
  // é pedaço de "$100.00" lido duas vezes, não $1.00.
  const m = pointed ?? (allowNoPoint && !/[.,]/.test(text) ? t.match(MONEY_NO_POINT_RE) : null);
  if (!m) return null;
  // Leitura sem o ponto custa um pouco: a corrente de saldos prefere
  // explicar a conta com o que foi lido inteiro.
  const extra = pointed ? 0 : 0.5;
  const negative = Boolean(m[1]);
  const hasDollar = Boolean(m[2]);
  const digits = m[3].replace(/,/g, "");
  const abs = Number(digits) * 100 + Number(m[4]);
  const unsure = confidence < 60 ? 0.5 : 1;
  const out: { cents: number; cost: number }[] = [
    { cents: negative ? -abs : abs, cost: extra },
    { cents: negative ? abs : -abs, cost: extra + 1 * unsure },
  ];
  // "-$4.21" lido como "54.21", "$100.00" como "3100.00": sem o "$", o
  // primeiro dígito pode ser o "$" (ou "-$") mal lido. Com o "$" lido,
  // ainda pode ser o "-" que virou 5, 3 ou 8 ("$520.00" era "-$20.00").
  const firstLooksLikeSign = /^[358]/.test(digits);
  if (digits.length >= 2 && (!hasDollar || firstLooksLikeSign)) {
    const alt = Number(digits.slice(1)) * 100 + Number(m[4]);
    const cost = extra + (hasDollar ? 2 : 1.5) * unsure;
    out.push({ cents: -alt, cost }, { cents: alt, cost });
  }
  return { raw: text, candidates: out, ...(green === undefined ? {} : { green }) };
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
/** Títulos de seção da lista ("Pending transactions", "Posted transactions"). */
const SECTION = /^(?:pending|posted|processing|recent)\s+transactions$|^(?:pendentes|lan[çc]ados|lan[çc]amentos)$/i;

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
    // Número sem ponto só na beirada direita, onde fica o valor: no meio
    // da linha ele é o fim do cartão ("... 10301327 9889").
    .map((w) => ({ w, m: readMoney(w.text, w.confidence, w.green, w.x0 > W * 0.7) }))
    .filter((x): x is { w: OcrWord; m: Money } => x.m !== null)
    .filter((x) => !BALANCE_LABEL.test(leftOf(x.w)));

  // Cabeçalhos à esquerda: datas e a seção "Pending".
  const headers = words
    .filter((w) => w.x0 < W * 0.4)
    .map((w) => ({ w, iso: readDate(w.text), pending: PENDING.test(w.text.trim()) }))
    .filter((x) => x.iso !== null || x.pending);

  // Altura comum de um valor. O leitor às vezes junta o valor e o saldo
  // numa caixa só, com o dobro da altura ("-$16.80" + saldo virando
  // "31680"): a altura dessa caixa não serve de régua.
  const heights = money.map((x) => x.w.y1 - x.w.y0).sort((p, q) => p - q);
  const typical = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0;

  const rows: (ScreenRow & { y0: number; y1: number })[] = [];
  const used = new Set<OcrWord>();
  for (let i = 0; i < money.length; i++) {
    const a = money[i];
    const h = Math.min(a.w.y1 - a.w.y0, typical * 1.3);
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

    for (const w of descWords) used.add(w);
    const header = [...headers].reverse().find((d) => d.w.y1 <= a.w.y0 + h * 0.2);
    rows.push({
      date: header?.iso ?? null,
      description: desc,
      amount: a.m,
      balance: bal?.m ?? null,
      pending: header?.pending ?? false,
      y0: a.w.y0,
      y1: bal ? bal.w.y1 : a.w.y1,
    });
  }
  const named = rows.filter((r) => r.description.length > 0);

  // Nome sem valor entre duas linhas lidas: é um lançamento cujo valor o
  // leitor não pegou. Só entre a primeira e a última linha (fora disso é
  // cabeçalho e menu do app).
  if (named.length >= 2 && typical > 0) {
    const first = named[0].y0;
    const last = named[named.length - 1].y1;
    const loose = words
      .filter((w) => !used.has(w) && w.x1 < W * 0.62 && w.x0 < W * 0.5)
      .filter((w) => w.y0 > first && w.y1 < last)
      .filter((w) => !readDate(w.text) && !JUNK.test(w.text) && w.confidence >= 60);
    const lines: OcrWord[][] = [];
    for (const w of [...loose].sort((p, q) => p.y0 - q.y0)) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(w.y0 - line[0].y0) < typical * 0.6) line.push(w);
      else lines.push([w]);
    }
    for (const line of lines) {
      const text = inReadingOrder(line, typical).map((w) => w.text).join(" ").trim();
      if (text.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 3 || SECTION.test(text)) continue;
      const y0 = Math.min(...line.map((w) => w.y0));
      const header = [...headers].reverse().find((d) => d.w.y1 <= y0);
      named.push({
        date: header?.iso ?? null,
        description: text,
        amount: { raw: "", candidates: [] },
        balance: null,
        pending: header?.pending ?? false,
        unread: true,
        y0,
        y1: Math.max(...line.map((w) => w.y1)),
      });
    }
    named.sort((p, q) => p.y0 - q.y0);
  }
  return named.map((r) => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    balance: r.balance,
    pending: r.pending,
    ...(r.unread ? { unread: true } : {}),
  }));
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
 * Tira as linhas cortadas na borda do print. A data do dia fica presa no
 * topo da tela enquanto se rola, e a linha que passa por baixo dela
 * aparece pela metade: sem o valor, o leitor pega o SALDO como se fosse o
 * valor ("algree +$741.01"). Na borda de baixo, o saldo é o que some. Uma
 * linha assim, na ponta e sem saldo, num print em que as outras têm
 * saldo, é pedaço de linha: ela aparece inteira no print vizinho.
 */
export function dropCutRows(rows: ScreenRow[]): { rows: ScreenRow[]; cut: number } {
  const withBalance = rows.filter((r) => r.balance).length;
  if (withBalance < 2) return { rows, cut: 0 };
  const isCut = (i: number) => (i === 0 || i === rows.length - 1) && !rows[i].balance;
  const kept = rows.filter((_, i) => !isCut(i));
  return { rows: kept, cut: rows.length - kept.length };
}

/**
 * Junta várias imagens (rolando a tela, uma pega o fim da outra) numa
 * lista só, do mais novo pro mais antigo, sem repetir o trecho em comum.
 */
export function mergeScreens(screens: ScreenRow[][]): { rows: ScreenRow[]; undated: number } {
  // Mais nova primeiro: a que tem "Pending" (fica no topo da lista do
  // app), depois pela data mais recente que aparece em cada uma.
  // Com dois prints que têm "Pending", o de mais pendentes é o de cima (o
  // outro já rolou pra baixo e só pega o fim dos pendentes).
  const newest = (rows: ScreenRow[]) => rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), "");
  const pendingCount = (rows: ScreenRow[]) => rows.filter((r) => r.pending).length;
  const ordered = screens
    .map((rows, i) => ({ rows, i }))
    .sort(
      (a, b) =>
        Math.sign(pendingCount(b.rows)) - Math.sign(pendingCount(a.rows)) ||
        pendingCount(b.rows) - pendingCount(a.rows) ||
        newest(b.rows).localeCompare(newest(a.rows)) ||
        a.i - b.i,
    )
    .map((s) => s.rows);

  // Linha com saldo é única na lista (nome + saldo): se já entrou por outro
  // print, não entra de novo, mesmo fora do trecho em comum (a ordem dos
  // prints pode deixar o trecho repetido longe da emenda).
  const seen = new Set<string>();

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
      if (r.balance) {
        const key = rowKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
      }
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
export function reconcile(
  input: ScreenRow[],
  openingCents?: number,
  /** Linhas sem valor legível que não deu pra tirar da conta (ficam de fora). */
  dropped: ScreenRow[] = [],
): ReconciledRow[] {
  // Linha sem valor legível sai da lista e fica presa à de cima: o valor
  // dela é a diferença entre o saldo da de cima e o da de baixo, menos o
  // valor da de cima.
  const rows: ScreenRow[] = [];
  const gapBelow = new Map<ScreenRow, ScreenRow>();
  for (const r of input) {
    if (!r.unread) {
      rows.push(r);
      continue;
    }
    const above = rows[rows.length - 1];
    if (above && above.balance && !gapBelow.has(above)) gapBelow.set(above, r);
    else dropped.push(r);
  }

  const out: ReconciledRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!rows[i].balance) {
      out.push(asRead(rows[i]));
      i++;
      continue;
    }
    // O trecho vai de uma linha com saldo até a última com saldo. Linhas
    // sem saldo no meio (o leitor não pegou a linha do saldo) entram: o
    // saldo delas sai da conta, e o das vizinhas confere o valor.
    let j = i + 1;
    let end = i + 1;
    while (j < rows.length && (rows[j].balance || j - end < MAX_GAP)) {
      if (rows[j].balance) end = j + 1;
      j++;
    }
    // O trecho que chega na linha mais antiga confere ela com o saldo que
    // o Velun já tem antes dela (quando foi passado).
    const run = rows.slice(i, end);
    // A mais antiga do trecho não tem a de baixo: a linha sem valor presa
    // a ela não tem como sair da conta.
    const last = run[run.length - 1];
    const lost = gapBelow.get(last);
    if (lost) {
      dropped.push(lost);
      gapBelow.delete(last);
    }
    out.push(...reconcileRun(run, end === rows.length ? openingCents : undefined, gapBelow));
    i = end;
  }
  return out;
}

/**
 * Quanto custa explicar a diferença dos saldos com uma linha sem valor
 * legível de valor `x`, com a de cima valendo `cents`. A explicação mais
 * barata é a de valor menor; entrada (que o app pinta de verde, e aqui
 * não se vê) e valor da de cima com o sinal contra a cor custam mais.
 */
function gapCost(x: number, cents: number, green: boolean | undefined): number {
  if (x === 0) return BREAK;
  let cost = 1 + Math.abs(x) / 10_000;
  if (x > 0) cost += 2;
  if (green !== undefined && cents !== 0 && cents > 0 !== green) cost += 2;
  return cost;
}

/** Até quantas linhas seguidas sem saldo um trecho atravessa. */
const MAX_GAP = 3;
/** Saldo que não fecha: só quando não há outro jeito. */
const BREAK = 50;
/**
 * Saldo lido que é ignorado e sai da conta ("$494.08" lido como
 * "6290.08"). Mais caro que qualquer correção de valor, bem mais barato
 * que deixar a corrente quebrar.
 */
const IGNORE_BALANCE = 4;
/** Estados guardados por linha, por segurança (com MAX_GAP, ficam bem abaixo disso). */
const KEEP_STATES = 2000;

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
    green: r.amount.green,
  };
}

/**
 * Um estado da corrente: o saldo da linha (lido ou tirado da conta) e o
 * menor custo dela até a mais antiga do trecho.
 */
type ChainState = {
  cents: number;
  cost: number;
  /** Candidato do valor escolhido nesta linha. */
  a: number;
  /** Candidato do saldo lido; -1 quando o saldo saiu da conta. */
  b: number;
  /** Estado escolhido na linha de baixo (-1 na mais antiga). */
  next: number;
  /** Fechou com a linha de baixo. */
  fits: boolean;
  /** Quantas linhas seguidas, até esta, estão com o saldo tirado da conta. */
  depth: number;
  /** Valor tirado da conta da linha sem valor legível logo abaixo desta. */
  gap?: number;
};

/**
 * Um trecho que começa e termina em linha com saldo. Pra cada linha, os
 * saldos possíveis: os que o leitor leu (cada leitura plausível) e o que
 * sai da conta com a linha de baixo, quando a linha não tem saldo ou o
 * saldo lido não serve.
 */
function reconcileRun(
  rows: ScreenRow[],
  openingCents: number | undefined,
  gapBelow: Map<ScreenRow, ScreenRow>,
): ReconciledRow[] {
  const n = rows.length;
  const states: ChainState[][] = new Array(n);

  // Os saldos lidos ficam sempre (são as âncoras da conta, mesmo quando
  // não fecham); dos tirados da conta, só os mais baratos.
  const keep = (list: ChainState[]): ChainState[] => {
    const byCents = new Map<number, ChainState>();
    for (const s of list) {
      const cur = byCents.get(s.cents);
      if (!cur || s.cost < cur.cost || (s.cost === cur.cost && s.b >= 0 && cur.b < 0)) byCents.set(s.cents, s);
    }
    const all = [...byCents.values()].sort((x, y) => x.cost - y.cost);
    const read = all.filter((s) => s.b >= 0);
    const derived = all.filter((s) => s.b < 0).slice(0, KEEP_STATES);
    return [...read, ...derived].sort((x, y) => x.cost - y.cost);
  };

  for (let i = n - 1; i >= 0; i--) {
    const bals = rows[i].balance?.candidates ?? [];
    const amts = rows[i].amount.candidates;
    const list: ChainState[] = [];
    if (i === n - 1) {
      // A mais antiga (sempre com saldo) só confere com o saldo que o
      // Velun tem antes dela. Sem isso (ou se não fecha), vale o valor lido.
      for (let b = 0; b < bals.length; b++) {
        let best: ChainState = { cents: bals[b].cents, cost: bals[b].cost, a: 0, b, next: -1, fits: false, depth: 0 };
        if (openingCents !== undefined) {
          for (let a = 0; a < amts.length; a++) {
            const fits = bals[b].cents === openingCents + amts[a].cents;
            const cost = bals[b].cost + amts[a].cost + (fits ? 0 : BREAK);
            if (a === 0 || cost < best.cost) best = { cents: bals[b].cents, cost, a, b, next: -1, fits, depth: 0 };
          }
        }
        list.push(best);
      }
      states[i] = keep(list);
      continue;
    }
    const below = states[i + 1];
    const cheapestBelow = below.reduce((m, s, k) => (s.cost < below[m].cost ? k : m), 0);
    if (gapBelow.has(rows[i])) {
      // Linha sem valor logo abaixo: o saldo lido desta não precisa fechar
      // com a de baixo; a diferença é o valor da que não deu pra ler.
      for (let a = 0; a < amts.length; a++) {
        for (let b = 0; b < bals.length; b++) {
          let best: ChainState | null = null;
          for (let k = 0; k < below.length; k++) {
            const x = bals[b].cents - amts[a].cents - below[k].cents;
            const cost = bals[b].cost + amts[a].cost + below[k].cost + gapCost(x, amts[a].cents, rows[i].amount.green);
            if (!best || cost < best.cost) best = { cents: bals[b].cents, cost, a, b, next: k, fits: false, depth: 0, gap: x };
          }
          if (best) list.push(best);
        }
      }
      states[i] = keep(list);
      continue;
    }
    for (let a = 0; a < amts.length; a++) {
      for (let k = 0; k < below.length; k++) {
        // No máximo MAX_GAP saldos seguidos tirados da conta: mais que
        // isso, a conta explica qualquer coisa.
        if (below[k].depth >= MAX_GAP) continue;
        const cents = below[k].cents + amts[a].cents;
        // Saldo tirado da conta: o da linha de baixo mais o valor desta.
        // Sem saldo lido, é o único jeito; com saldo lido, é ignorá-lo.
        const ignore = bals.length === 0 ? 0 : IGNORE_BALANCE;
        list.push({ cents, cost: below[k].cost + amts[a].cost + ignore, a, b: -1, next: k, fits: true, depth: below[k].depth + 1 });
      }
      for (let b = 0; b < bals.length; b++) {
        // O saldo lido que fecha com algum estado de baixo.
        let fitK = -1;
        for (let k = 0; k < below.length; k++) {
          if (below[k].cents + amts[a].cents === bals[b].cents && (fitK < 0 || below[k].cost < below[fitK].cost)) fitK = k;
        }
        if (fitK >= 0) {
          list.push({ cents: bals[b].cents, cost: bals[b].cost + amts[a].cost + below[fitK].cost, a, b, next: fitK, fits: true, depth: 0 });
        } else {
          list.push({
            cents: bals[b].cents,
            cost: bals[b].cost + amts[a].cost + BREAK + below[cheapestBelow].cost,
            a,
            b,
            next: cheapestBelow,
            fits: false,
            depth: 0,
          });
        }
      }
    }
    // A mais nova do trecho sempre tem saldo lido: ela ancora a conta.
    states[i] = keep(i === 0 ? list.filter((s) => s.b >= 0) : list);
  }

  const path: ChainState[] = [];
  let k = states[0].reduce((m, s, idx) => (s.cost < states[0][m].cost ? idx : m), 0);
  for (let i = 0; i < n; i++) {
    const s = states[i][k];
    path.push(s);
    k = s.next;
  }

  // Conferido: fechou com a de baixo, e a conta passa por no máximo uma
  // linha sem saldo lido até o próximo saldo lido. Com duas ou mais
  // seguidas, os valores saem da conta mas a soma é que confere, não
  // cada um.
  const free = (i: number) => path[i].b < 0;
  const freeRunAt = (i: number) => {
    // Tamanho do bloco de linhas sem saldo lido que contém i (ou logo abaixo de i).
    let s = i;
    while (s > 0 && free(s - 1)) s--;
    let e = i;
    while (e < n && free(e)) e++;
    return e - s;
  };
  const out: ReconciledRow[] = [];
  for (let i = 0; i < n; i++) {
    const s = path[i];
    const lost = gapBelow.get(rows[i]);
    let checked: boolean;
    if (i === n - 1) checked = s.fits;
    else if (free(i)) {
      // Sem saldo lido: confere pela de cima, que tem saldo e fecha.
      checked = freeRunAt(i) === 1 && i > 0 && !free(i - 1) && path[i - 1].fits && path[i + 1] !== undefined && !free(i + 1);
    } else {
      checked = s.fits && (!free(i + 1) || freeRunAt(i + 1) === 1);
    }
    out.push({
      date: rows[i].date ?? "",
      description: rows[i].description,
      amountCents: rows[i].amount.candidates[s.a].cents,
      balanceCents: s.cents,
      // Saldo que saiu da conta numa linha que tinha saldo lido também é correção.
      corrected: s.a !== 0 || (rows[i].balance !== null && s.b !== 0),
      checked,
      pending: rows[i].pending ?? false,
      green: rows[i].amount.green,
    });
    if (lost && s.gap !== undefined) {
      // Valor tirado da conta: entra pra conferir, nunca como conferido.
      out.push({
        date: lost.date ?? "",
        description: lost.description,
        amountCents: s.gap,
        balanceCents: s.cents - rows[i].amount.candidates[s.a].cents,
        corrected: true,
        checked: false,
        pending: lost.pending ?? false,
      });
    }
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

/**
 * Valor que o saldo não confere (a última linha do print, sem a de baixo)
 * fica como foi lido, e o leitor perde o "-" com facilidade: "-$16.43"
 * vira "$16.43", uma compra virando entrada. O app pinta entrada de
 * verde; quando a cor do valor é conhecida, ela decide o sinal.
 */
function bySignColor(r: ReconciledRow): ReconciledRow {
  if (r.checked || r.green === undefined || r.amountCents === 0) return r;
  const positive = r.amountCents > 0;
  if (positive === r.green) return r;
  return { ...r, amountCents: -r.amountCents, corrected: true };
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
  /** Linhas cortadas na borda de um print: ficaram de fora (aparecem inteiras no vizinho). */
  cut: number;
  /** Na seção "Pending": quantos. */
  pending: number;
  /**
   * Os pendentes, do mais novo pro mais antigo, com o valor já conferido
   * pela corrente de saldos. O nome vem como o banco mostra ("PIE FECTION
   * 10292109 3145"); data e nome limpo saem em readPending.
   */
  pendingRows: { description: string; amountCents: number; checked: boolean }[];
  /** A linha mais antiga (não pendente). `excluded`: ficou de fora por não dar pra conferir. */
  oldest: { date: string; description: string; balanceCents: number | null; excluded: boolean } | null;
  /** Linhas cujo valor não deu pra conferir pelo saldo (do mais novo pro mais antigo). */
  unchecked: { date: string; description: string; amountCents: number }[];
  /** Linhas com nome e sem valor legível, que nem o saldo explicou: ficaram de fora. */
  unread: { description: string; pending: boolean }[];
} {
  let cut = 0;
  const perScreen = screens.map((s) => {
    const trimmed = dropCutRows(rowsFromScreen(s));
    cut += trimmed.cut;
    return trimmed.rows;
  });
  const { rows, undated } = mergeScreens(perScreen);
  // Os pendentes entram na conferência (o saldo deles emenda com o resto)
  // mas não na importação: o banco ainda pode mudar valor e data, e o
  // lançamento de verdade vem no próximo print ou extrato.
  const dropped: ScreenRow[] = [];
  const all = reconcile(rows, openingCents, dropped).map(bySignColor);
  let reconciled = all.filter((r) => !r.pending);
  // A linha mais antiga só confere com a de baixo dela, que não está no
  // print. Se nem o saldo do Velun fecha com ela, o valor é um chute do
  // leitor ("-$10.58" lido como "$510.58"): fica de fora em vez de entrar
  // errado. O saldo dela continua valendo como ponto de partida.
  const last = reconciled[reconciled.length - 1];
  // (Só quando todas as linhas têm saldo; numa lista sem saldo, nada
  // confere e tudo entra marcado pra conferir.)
  const allHaveBalance = reconciled.every((r) => r.balanceCents !== null);
  const excludeOldest = Boolean(last && allHaveBalance && !last.checked && reconciled.length > 1);
  const oldest = last
    ? {
        date: last.date,
        description: last.description,
        balanceCents: last.balanceCents,
        excluded: excludeOldest,
      }
    : null;
  if (excludeOldest) reconciled = reconciled.slice(0, -1);
  const { statement, hasBalances } = toStatement(reconciled);
  return {
    statement,
    hasBalances,
    corrected: reconciled.filter((r) => r.corrected).length,
    undated,
    cut,
    pending: all.length - all.filter((r) => !r.pending).length,
    pendingRows: all
      .filter((r) => r.pending)
      .map((r) => ({ description: r.description, amountCents: r.amountCents, checked: r.checked })),
    oldest,
    unchecked: reconciled
      .filter((r) => !r.checked)
      .map((r) => ({ date: r.date, description: r.description, amountCents: r.amountCents })),
    unread: dropped.map((r) => ({ description: r.description, pending: r.pending ?? false })),
  };
}
