"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { computeFingerprint, normalizeDescription } from "@/lib/fingerprint";
import { cleanBankDescription, isGenericBankText } from "@/lib/import/clean-description";
import { rememberMerchantName } from "@/lib/merchant-names";
import {
  learnedCategoryFor,
  loadMerchantCategories,
  merchantKey,
  rememberMerchantCategory,
  sameMerchantRows,
} from "@/lib/merchant-categories";
import { loadCards } from "@/lib/cards";
import { todayIn } from "@/lib/today";
import { matchCardPayments } from "@/lib/import/match-card-payment";
import { fetchExistingCardPayments } from "@/lib/import/confirmed-candidates";
import {
  parseRegionsStatementText,
  StatementParseError,
  type ParsedStatement,
} from "@/lib/import/regions-pdf";
import {
  looksLikeNubank,
  parseNubankStatementText,
  verifyCardStatement,
} from "@/lib/import/nubank-pdf";
import { verifyStatement } from "@/lib/import/verify";
import { looksLikeNomad, parseNomadStatementText } from "@/lib/import/nomad-pdf";
import { suggestCategoryId } from "@/lib/import/mcc";
import { screensToStatement, type OcrScreen } from "@/lib/import/screenshot";
import { isIsoDate, type FileStatement } from "@/lib/import/file-statement";
import type { ColumnMapping } from "@/lib/import/table";
import { duplicateCounter } from "@/lib/import/duplicates";
import { fitsDirection } from "@/lib/category-kind";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  matchForecast,
  type ForecastCandidate,
} from "@/lib/import/match-forecast";
import { matchConfirmed, matchConfirmedExact } from "@/lib/import/match-confirmed";
import { fetchConfirmedCandidates } from "@/lib/import/confirmed-candidates";

const MAX_TEXT_LENGTH = 2 * 1024 * 1024;

/** Data ISO deslocada em N dias (negativo anda pra trás). */
function shiftDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export type ImportResult =
  | {
      ok: true;
      importId: string;
      /** null: o documento não traz como conferir (Nomad). */
      matches: boolean | null;
      count: number;
      duplicates: number;
      message: string | null;
    }
  | { ok: false; error: string };

/**
 * Resultado das ações da importação.
 *
 * Elas não podem lançar exceção. O Next mascara erro de server action em
 * produção: o cliente recebe só um código opaco ("digest"), a mensagem
 * real fica no log do servidor, e a tela não mostra nada. Quem clicou vê
 * o botão não fazer efeito e não tem como saber por quê.
 *
 * Isso já tinha sido consertado na importação e eu deixei o resto do
 * arquivo lançando. Resultado: confirmar uma importação quebrou em
 * produção e o usuário levou um clique no vazio, sem mensagem nenhuma.
 */
export type ActionResult =
  { ok: true } | { ok: false; error: string; detail?: string };

/**
 * Roda a ação e traduz qualquer exceção em resultado.
 *
 * `error` é a frase pra quem está usando; `detail` é a mensagem técnica,
 * que a tela mostra embaixo em letra miúda. Sem o detalhe, erro de banco
 * vira "algo deu errado" e a depuração depende de acesso ao log — o que
 * não serve nem pra mim nem pra quem for usar isso depois.
 */
async function attempt(
  error: string,
  fn: () => Promise<void>,
): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error, detail };
  }
}

/**
 * Recebe o TEXTO já extraído do extrato, confere e grava em staging.
 *
 * O PDF não chega aqui: a extração acontece no navegador, então o
 * arquivo nunca sai da máquina de quem importa. O servidor vê só o
 * texto, e guarda só o que foi extraído.
 *
 * Nada vira transação aqui: a importação só preenche
 * `staged_transactions`, que é o que a tela de revisão mostra. Confirmar
 * é um segundo passo deliberado — importação automática que escreve
 * direto no histórico é importação em que você não pode confiar.
 */
export async function importStatement(input: {
  accountId: string;
  fileName: string;
  /** Texto do PDF (extraído no navegador). */
  text?: string;
  /** Ou: palavras reconhecidas em prints da lista do app (no navegador). */
  screens?: OcrScreen[];
  /** Ou: lançamentos lidos de OFX/QFX, CSV ou planilha (no navegador). */
  file?: FileStatement;
  /** Colunas usadas na planilha, pra lembrar na próxima (CSV/XLSX). */
  mapping?: { signature: string; columns: ColumnMapping };
}): Promise<ImportResult> {
  try {
    return await runImportStatement(input);
  } catch (err) {
    return {
      ok: false,
      error: `Não consegui importar o extrato. ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Saldo da conta no Velun no fim do dia anterior a `date` (só confirmados). */
async function balanceBefore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  accountId: string,
  date: string,
): Promise<number> {
  const { data: account } = await supabase
    .from("accounts")
    .select("opening_balance_cents")
    .eq("id", accountId)
    .maybeSingle();
  const rows = await fetchAll<{ amount_cents: number; direction: string }>((from, to) =>
    supabase
      .from("transactions")
      .select("amount_cents, direction")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .eq("status", "cleared")
      .lt("date", date)
      .order("id")
      .range(from, to),
  );
  return rows.reduce(
    (n, r) => n + (r.direction === "in" ? r.amount_cents : -r.amount_cents),
    (account?.opening_balance_cents as number | undefined) ?? 0,
  );
}

/** Prints vêm do navegador: confere o formato antes de confiar. */
function validScreens(screens: unknown): OcrScreen[] | null {
  if (!Array.isArray(screens) || screens.length === 0 || screens.length > 12) return null;
  const out: OcrScreen[] = [];
  for (const s of screens) {
    if (!s || typeof s !== "object") return null;
    const { width, height, words } = s as OcrScreen;
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Array.isArray(words) || words.length > 4000) return null;
    const clean = [];
    for (const w of words) {
      if (!w || typeof w.text !== "string" || w.text.length > 80) return null;
      const nums = [w.confidence, w.x0, w.y0, w.x1, w.y1];
      if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
      clean.push({ text: w.text, confidence: w.confidence, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 });
    }
    out.push({ width, height, words: clean });
  }
  return out;
}

const MAX_FILE_ROWS = 5000;

/**
 * Lançamentos de arquivo vêm do navegador: confere cada campo antes de
 * confiar. Devolve a frase do problema, ou o extrato limpo.
 */
function validFileStatement(file: unknown): FileStatement | string {
  if (!file || typeof file !== "object") return "Não consegui ler esse arquivo.";
  const f = file as FileStatement;
  if (f.format !== "ofx" && f.format !== "csv" && f.format !== "xlsx") return "Formato de arquivo desconhecido.";
  if (!Array.isArray(f.transactions) || f.transactions.length === 0) {
    return "Não achei lançamentos nesse arquivo. Confira as colunas e o período baixado.";
  }
  if (f.transactions.length > MAX_FILE_ROWS) {
    return `Esse arquivo tem mais de ${MAX_FILE_ROWS} lançamentos. Baixe um período menor (alguns meses por vez).`;
  }
  const transactions: FileStatement["transactions"] = [];
  for (const t of f.transactions) {
    if (!t || typeof t !== "object") return "Não consegui ler esse arquivo.";
    if (typeof t.date !== "string" || !isIsoDate(t.date)) return "Tem lançamento com data inválida no arquivo.";
    if (!Number.isInteger(t.amountCents) || t.amountCents <= 0 || t.amountCents > 100_000_000_00) {
      return "Tem lançamento com valor inválido no arquivo.";
    }
    if (t.direction !== "in" && t.direction !== "out") return "Não consegui ler esse arquivo.";
    const description = typeof t.description === "string" ? t.description.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const mcc = typeof t.mcc === "string" && /^\d{4}$/.test(t.mcc) ? t.mcc : null;
    transactions.push({ date: t.date, description: description || "Lançamento", amountCents: t.amountCents, direction: t.direction, mcc });
  }
  const dates = transactions.map((t) => t.date).sort();
  let periodStart = dates[0];
  let periodEnd = dates[dates.length - 1];
  // O período informado só pode alargar até 45 dias além das datas.
  if (typeof f.periodStart === "string" && isIsoDate(f.periodStart) && f.periodStart < periodStart && f.periodStart >= shiftDays(periodStart, -45)) periodStart = f.periodStart;
  if (typeof f.periodEnd === "string" && isIsoDate(f.periodEnd) && f.periodEnd > periodEnd && f.periodEnd <= shiftDays(periodEnd, 45)) periodEnd = f.periodEnd;
  const balance =
    f.balance && typeof f.balance === "object" && Number.isInteger(f.balance.cents) && Math.abs(f.balance.cents) < 1e13 && typeof f.balance.date === "string" && isIsoDate(f.balance.date)
      ? { cents: f.balance.cents, date: f.balance.date }
      : null;
  return {
    format: f.format,
    periodStart,
    periodEnd,
    kind: f.kind === "bank" || f.kind === "card" ? f.kind : null,
    balance,
    transactions,
    skipped: Number.isInteger(f.skipped) && f.skipped >= 0 ? f.skipped : 0,
  };
}

function validMapping(m: unknown): { signature: string; columns: ColumnMapping } | null {
  if (!m || typeof m !== "object") return null;
  const { signature, columns: c } = m as { signature: unknown; columns: ColumnMapping };
  if (typeof signature !== "string" || signature.length === 0 || signature.length > 400 || !c) return null;
  const col = (x: unknown) => x === null || (Number.isInteger(x) && (x as number) >= 0 && (x as number) < 200);
  if (!Number.isInteger(c.headerRow) || c.headerRow < -1 || c.headerRow > 100) return null;
  if (!col(c.date) || c.date === null || !col(c.description) || c.description === null) return null;
  if (!col(c.amount) || !col(c.debit) || !col(c.credit)) return null;
  if (!["ymd", "dmy", "mdy"].includes(c.dateFormat) || (c.decimal !== "." && c.decimal !== ",")) return null;
  if (typeof c.outIsNegative !== "boolean") return null;
  return {
    signature,
    columns: {
      headerRow: c.headerRow,
      date: c.date,
      description: c.description,
      amount: c.amount,
      debit: c.debit,
      credit: c.credit,
      dateFormat: c.dateFormat,
      decimal: c.decimal,
      outIsNegative: c.outIsNegative,
    },
  };
}

const FILE_LABEL: Record<FileStatement["format"], string> = {
  ofx: "do arquivo OFX",
  csv: "do CSV",
  xlsx: "da planilha",
};

async function runImportStatement(input: {
  accountId: string;
  fileName: string;
  text?: string;
  screens?: OcrScreen[];
  file?: FileStatement;
  mapping?: { signature: string; columns: ColumnMapping };
}): Promise<ImportResult> {
  const { householdId, memberId, timezone } = await getCurrentMember();
  const supabase = await createClient();

  const { accountId, fileName } = input;
  const text = input.text ?? "";
  const screens = input.screens ? validScreens(input.screens) : null;
  if (input.screens && !screens) return { ok: false, error: "Não consegui ler esses prints. Tente de novo." };
  const fileChecked = input.file ? validFileStatement(input.file) : null;
  if (typeof fileChecked === "string") return { ok: false, error: fileChecked };
  const fileInput = fileChecked;

  // Falhas previsíveis voltam como resultado, não como exceção: o Next
  // mascara erro de server action em produção, e o usuário acabaria
  // vendo um código do React no lugar da causa.
  if (!accountId) return { ok: false, error: "Escolha a conta do extrato." };
  if (!screens && !fileInput && !text.trim()) {
    return {
      ok: false,
      error:
        "Não consegui ler texto nesse PDF. Ele pode ser um documento escaneado.",
    };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: "Esse extrato é grande demais para importar de uma vez.",
    };
  }

  // Uma revisão aberta por conta. Duas revisões do mesmo extrato
  // pareciam uma só na tela — ela mostra a mais recente — e confirmar
  // uma fazia a outra aparecer idêntica no lugar: o clique parecia não
  // ter feito nada, o segundo clique confirmava a outra, e o mês ficou
  // em dobro. O banco também garante isso (migração 0015); aqui é só
  // pra a mensagem ser clara antes de qualquer trabalho.
  const { data: openReview } = await supabase
    .from("imports")
    .select("file_path")
    .eq("account_id", accountId)
    .eq("status", "review")
    .limit(1);

  if (openReview && openReview.length > 0) {
    return {
      ok: false,
      error: `Já tem um extrato em revisão nessa conta (${openReview[0].file_path}). Confirme ou descarte antes de importar outro.`,
    };
  }

  // Cartão lê fatura; conta lê extrato. Cada lado recusa o PDF do outro
  // com uma mensagem clara, em vez de importar lixo.
  const { data: account } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Conta não encontrada." };
  const isCard = account.type === "credit_card";

  let statement: ParsedStatement;
  let screensNote: string | null = null;
  /** Saldo do Velun antes do print (só prints com saldo). */
  let screensBefore: number | null = null;
  let cardDaysNote: string | null = null;
  let nomadNote: string | null = null;
  let fileNote: string | null = null;
  // `matches` null: o documento não traz como conferir (Nomad).
  let verification: {
    matches: boolean | null;
    extractedSumCents: number;
    firstDivergence?: { date: string } | null;
  };
  try {
    if (fileInput) {
      // O arquivo diz de que tipo é a conta (OFX): recusa o do outro lado,
      // como no PDF.
      if (isCard && fileInput.kind === "bank") {
        return { ok: false, error: "Esse arquivo é de conta corrente. Escolha a conta, não o cartão." };
      }
      if (!isCard && fileInput.kind === "card") {
        return { ok: false, error: "Esse arquivo é de cartão de crédito. Escolha o cartão como conta pra importar." };
      }
      const sum = fileInput.transactions.reduce((n, t) => n + (t.direction === "in" ? t.amountCents : -t.amountCents), 0);
      statement = {
        periodStart: fileInput.periodStart,
        periodEnd: fileInput.periodEnd,
        beginningBalanceCents: 0,
        endingBalanceCents: fileInput.balance?.cents ?? 0,
        transactions: fileInput.transactions,
        dailyBalances: [],
      };
      verification = { matches: null, extractedSumCents: sum };
      const fmt = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      const br = (iso: string) => iso.split("-").reverse().join("/");
      const n = fileInput.transactions.length;
      const parts = [`Lido ${FILE_LABEL[fileInput.format]}: ${n} ${n === 1 ? "lançamento" : "lançamentos"}.`];
      if (fileInput.skipped > 0) {
        parts.push(
          fileInput.skipped === 1
            ? "1 linha sem data ou valor (saldo, total) ficou de fora."
            : `${fileInput.skipped} linhas sem data ou valor (saldos, totais) ficaram de fora.`,
        );
      }
      // Conta com saldo informado no arquivo: o saldo do Velun antes do
      // período mais os lançamentos do arquivo tem que dar o do banco.
      if (fileInput.balance && !isCard && fileInput.balance.date >= statement.periodEnd) {
        const before = await balanceBefore(supabase, householdId, accountId, statement.periodStart);
        const after = before + sum;
        statement.beginningBalanceCents = fileInput.balance.cents - sum;
        const diff = fileInput.balance.cents - after;
        verification.matches = diff === 0;
        if (diff !== 0) {
          parts.push(
            `O banco informa saldo de ${fmt(fileInput.balance.cents)} em ${br(fileInput.balance.date)}. O Velun tem ${fmt(before)} antes de ${br(statement.periodStart)} e, com estes lançamentos, fecharia em ${fmt(after)} (diferença de ${fmt(diff)}). Faltam ou sobram lançamentos antes de ${br(statement.periodStart)}, ou o arquivo não cobre o período inteiro.`,
          );
        }
      } else if (fileInput.balance) {
        parts.push(
          isCard
            ? `O arquivo informa saldo do cartão de ${fmt(fileInput.balance.cents)} em ${br(fileInput.balance.date)}.`
            : `O banco informa saldo de ${fmt(fileInput.balance.cents)} em ${br(fileInput.balance.date)}. Depois de importar, compare com o saldo da conta no Velun.`,
        );
      }
      fileNote = parts.join(" ");
    } else if (screens) {
      if (isCard) {
        return {
          ok: false,
          error: "Print funciona pra conta. Pra cartão, use o OFX/CSV do cartão ou o PDF da fatura do Nubank.",
        };
      }
      let read = screensToStatement(screens);
      if (read.statement.transactions.length === 0) {
        return {
          ok: false,
          error:
            read.pending > 0
              ? "Esses prints só mostram lançamentos pendentes. Eles entram quando o banco lançar: importe de novo daqui a uns dias."
              : "Não achei lançamentos nesses prints. Use prints da lista de lançamentos do app, com a data e os valores aparecendo.",
        };
      }
      // O print mostra o saldo antes do lançamento mais antigo. Com o saldo
      // que o Velun já tem nesse ponto dá pra conferir o mais antigo também;
      // se não bate, faltam (ou sobram) lançamentos ANTES do print.
      let before: number | null = null;
      if (read.hasBalances && read.oldest) {
        const oldestDate = read.oldest.date;
        before = await balanceBefore(supabase, householdId, accountId, oldestDate);
        // Lançado à mão uns dias antes e lançado pelo banco depois (o
        // "Fxreplay" do dia 10 que caiu no 13): conta no saldo do Velun
        // antes do print, mas é o mesmo dinheiro de uma linha do print.
        const nearby = await fetchConfirmedCandidates(supabase, householdId, accountId, {
          periodStart: oldestDate,
          periodEnd: read.statement.periodEnd,
        });
        const used = new Set<string>();
        for (const t of read.statement.transactions) {
          const twin = nearby.find(
            (c) => !used.has(c.id) && c.date < oldestDate && c.amountCents === t.amountCents && c.direction === t.direction,
          );
          if (!twin) continue;
          used.add(twin.id);
          before -= twin.direction === "in" ? twin.amountCents : -twin.amountCents;
        }
        read = screensToStatement(screens, before);
      }
      statement = read.statement;
      verification = read.hasBalances
        ? verifyStatement(statement)
        : {
            matches: null,
            extractedSumCents: statement.transactions.reduce(
              (n, t) => n + (t.direction === "in" ? t.amountCents : -t.amountCents),
              0,
            ),
          };
      const fmt = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      const signed = (c: number) => `${c < 0 ? "−" : "+"}${fmt(Math.abs(c))}`;
      const parts: string[] = [];
      parts.push(
        `Lido de ${screens.length} ${screens.length === 1 ? "print" : "prints"}: ${statement.transactions.length} lançamentos.`,
      );
      if (read.hasBalances && read.corrected > 0) {
        parts.push(
          read.corrected === 1
            ? "1 valor mal lido foi corrigido pelo saldo que o app mostra."
            : `${read.corrected} valores mal lidos foram corrigidos pelo saldo que o app mostra.`,
        );
      }
      if (!read.hasBalances) {
        parts.push("Atenção: nem todas as linhas mostram o saldo, então não deu pra conferir tudo. Compare cada valor com o app antes de confirmar.");
      }
      if (read.unchecked.length > 0 && read.unchecked.length <= 5) {
        const list = read.unchecked.map((u) => `${u.description} ${signed(u.amountCents)}`).join(", ");
        parts.push(`Confira no app: ${list}. ${read.unchecked.length === 1 ? "Esse valor não deu" : "Esses valores não deram"} pra conferir pelo saldo.`);
      } else if (read.unchecked.length > 5) {
        parts.push(`${read.unchecked.length} valores não deram pra conferir pelo saldo: compare com o app antes de confirmar.`);
      }
      if (read.pending > 0) {
        parts.push(
          `${read.pending} ${read.pending === 1 ? "lançamento pendente ficou" : "lançamentos pendentes ficaram"} de fora: ${read.pending === 1 ? "entra" : "entram"} quando o banco lançar, no próximo print ou extrato.`,
        );
      }
      if (read.undated > 0) {
        parts.push(
          `${read.undated} ${read.undated === 1 ? "linha ficou" : "linhas ficaram"} de fora por não ter data à vista. Role um pouco pra cima no app e tire o print de novo.`,
        );
      }
      if (read.oldest?.excluded) {
        const [, m, d] = read.oldest.date.split("-");
        parts.push(
          `A linha mais antiga (${read.oldest.description}, ${d}/${m}) ficou de fora: o valor dela não dá pra conferir pelo saldo. Ela entra na próxima importação se o print mostrar também a linha de baixo dela.`,
        );
        if (before !== null) {
          parts.push(
            `Atenção: o saldo do Velun antes de ${d}/${m} (${fmt(before)}) não fecha com o do app: faltam ou sobram lançamentos antes dessa data. Importe um print ou extrato dos dias anteriores.`,
          );
        }
      } else {
        // A comparação com o saldo do Velun é feita mais abaixo, depois de
        // saber quais lançamentos seus esta importação vai substituir.
        screensBefore = before;
      }
      screensNote = parts.join(" ");
    } else if (isCard) {
      if (!looksLikeNubank(text)) {
        return {
          ok: false,
          error:
            "Não reconheci essa fatura. Em PDF o Velun lê a do Nubank; de outro cartão, baixe o OFX/QFX ou o CSV no site do banco.",
        };
      }
      const card = parseNubankStatementText(text);
      statement = card;
      verification = verifyCardStatement(card);
      // A fatura diz quando o cartão fecha e vence; se o cadastro está
      // diferente, ela manda — é o que decide em que fatura cai cada compra.
      const closeDay = Number(card.periodEnd.slice(8, 10));
      const dueDay = Number(card.dueDate.slice(8, 10));
      const { data: adjusted } = await supabase
        .from("accounts")
        .update({ statement_close_day: closeDay, payment_due_day: dueDay })
        .eq("id", accountId)
        .or(
          `statement_close_day.is.null,payment_due_day.is.null,statement_close_day.neq.${closeDay},payment_due_day.neq.${dueDay}`,
        )
        .select("id");
      if (adjusted && adjusted.length > 0) {
        cardDaysNote = `Ajustei o cartão pra fechar dia ${closeDay} e vencer dia ${dueDay}, como na fatura.`;
      }
    } else {
      if (looksLikeNubank(text)) {
        return {
          ok: false,
          error:
            "Esse PDF é fatura de cartão. Escolha o cartão como conta pra importar.",
        };
      }
      if (looksLikeNomad(text)) {
        const nomad = parseNomadStatementText(text);
        statement = nomad;
        verification = {
          matches: null,
          extractedSumCents: nomad.transactions.reduce(
            (n, t) => n + (t.direction === "in" ? t.amountCents : -t.amountCents),
            0,
          ),
        };
        const parts: string[] = [];
        if (nomad.cancelledCount > 0) {
          parts.push(
            nomad.cancelledCount === 1
              ? "1 compra cancelada ficou de fora."
              : `${nomad.cancelledCount} compras canceladas ficaram de fora.`,
          );
        }
        if (nomad.processingCount > 0) {
          parts.push(
            nomad.processingCount === 1
              ? "1 lançamento ainda está processando e entrou como saída — a Nomad já desconta do saldo."
              : `${nomad.processingCount} lançamentos ainda estão processando e entraram — a Nomad já desconta do saldo.`,
          );
        }
        const unknown = Object.entries(nomad.unknownStatuses);
        if (unknown.length > 0) {
          const total = unknown.reduce((n, [, c]) => n + c, 0);
          const names = unknown.map(([name]) => `"${name}"`).join(", ");
          parts.push(
            `Atenção: ${total} ${total === 1 ? "lançamento ficou" : "lançamentos ficaram"} de fora por uma situação que o Velun ainda não conhece (${names}). Confira no app da Nomad.`,
          );
        }
        if (nomad.reportedBalance) {
          const [y, m, d] = nomad.reportedBalance.date.split("-");
          const amount = (nomad.reportedBalance.cents / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
          });
          parts.push(
            `A Nomad informa saldo de US$ ${amount} em ${d}/${m}/${y}. Depois de importar até essa data, compare com o saldo da conta no Velun.`,
          );
        }
        nomadNote = parts.join(" ") || null;
      } else {
        statement = parseRegionsStatementText(text);
        verification = verifyStatement(statement);
      }
    }
  } catch (err) {
    if (err instanceof StatementParseError)
      return { ok: false, error: err.message };
    throw err;
  }

  // O nome do arquivo é registrado, não o conteúdo: o PDF não é guardado
  // em lugar nenhum. O que fica é o que foi extraído e revisado.
  const { data: created, error: importError } = await supabase
    .from("imports")
    .insert({
      household_id: householdId,
      account_id: accountId,
      file_path: fileName,
      file_type: fileInput ? fileInput.format : screens ? "image" : "pdf",
      status: "review",
      statement_start: statement.periodStart,
      statement_end: statement.periodEnd,
      closing_balance_cents: fileInput ? (fileInput.balance?.cents ?? null) : statement.endingBalanceCents,
      extracted_sum_cents: verification.extractedSumCents,
      balance_matches: verification.matches,
      created_by: memberId,
    })
    .select("id")
    .single();

  if (importError) {
    // 23505: a regra de uma revisão por conta barrou — outra importação
    // chegou entre a checagem acima e esta gravação.
    if (importError.code === "23505") {
      return {
        ok: false,
        error:
          "Já tem um extrato em revisão nessa conta. Confirme ou descarte antes de importar outro.",
      };
    }
    throw new Error(importError.message);
  }
  const importId = created.id as string;

  // Categorias do household, por nome, pro casamento com o MCC. `kind`
  // vem junto porque a sugestão tem que respeitar a direção da linha:
  // estorno de cartão traz o mesmo MCC da compra.
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, kind, is_transfer")
    .eq("household_id", householdId)
    .eq("is_archived", false);

  const categoriesByName = new Map(
    (categories ?? []).map((c) => [
      (c.name as string).toLowerCase(),
      { id: c.id as string, kind: c.kind as string, is_transfer: (c.is_transfer as boolean | null) ?? false },
    ]),
  );

  // Fingerprints já existentes nessa conta, pra marcar duplicata. O
  // mesmo cálculo do lançamento manual, então extrato e digitação são
  // comparáveis.
  //
  // Em páginas: o Supabase devolve no máximo 1000 linhas por consulta, e
  // um extrato de anos passa disso fácil — sem paginar, o que passasse
  // de 1000 entraria em dobro.
  const existing = await fetchAll<{
    fingerprint: string;
    date: string;
    amount_cents: number;
    direction: string;
    status: string;
    import_id: string | null;
  }>((from, to) =>
    supabase
      .from("transactions")
      .select("fingerprint, date, amount_cents, direction, status, import_id")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .gte("date", statement.periodStart)
      .lte("date", statement.periodEnd)
      .order("id")
      .range(from, to),
  );

  // Por contagem: três saques iguais no mesmo dia são três lançamentos.
  //
  // Print: o nome que o app mostra ("DoorDash") não é o texto do banco do
  // extrato em PDF ("DOORDASH*ARENA ..."), então a impressão digital não
  // reconhece o que já veio do PDF. Ali vale dia + valor + direção,
  // contra o que já está confirmado — também por contagem.
  const looseKey = (date: string, direction: string, cents: number) => `${date}|${direction}|${cents}`;
  const isExistingDuplicate = screens
    ? (() => {
        const loose = duplicateCounter(
          existing.filter((t) => t.status === "cleared").map((t) => looseKey(t.date, t.direction, t.amount_cents)),
        );
        return (_fp: string, t: { date: string; direction: string; amountCents: number }) =>
          loose(looseKey(t.date, t.direction, t.amountCents));
      })()
    : fileInput
      ? (() => {
          // Arquivo: o texto do banco no OFX/CSV não é o do PDF (o OFX corta
          // o nome em 32 letras, o CSV às vezes traz outra descrição). O que
          // já veio de outra importação vale por dia + valor + direção; o
          // resto, pela impressão digital. Uma linha existente só é
          // "gasta" uma vez: o que bate pela impressão digital sai também
          // da contagem solta.
          const strict = duplicateCounter(existing.map((t) => t.fingerprint));
          const imported = existing.filter((t) => t.status === "cleared" && t.import_id);
          const looseLeft = new Map<string, number>();
          for (const t of imported) {
            const k = looseKey(t.date, t.direction, t.amount_cents);
            looseLeft.set(k, (looseLeft.get(k) ?? 0) + 1);
          }
          const importedFp = new Set(imported.map((t) => t.fingerprint));
          // Primeiro todas as exatas, depois as soltas — senão uma linha
          // solta poderia gastar a existente de uma exata mais abaixo.
          const exact = new Map<number, boolean>();
          statement.transactions.forEach((t, i) => {
            const fp = computeFingerprint({ accountId, date: t.date, amountCents: t.amountCents, description: t.description });
            if (!strict(fp)) return;
            exact.set(i, true);
            const k = looseKey(t.date, t.direction, t.amountCents);
            if (importedFp.has(fp) && (looseLeft.get(k) ?? 0) > 0) looseLeft.set(k, (looseLeft.get(k) ?? 0) - 1);
          });
          return (_fp: string, t: { date: string; direction: string; amountCents: number }, index: number) => {
            if (exact.has(index)) return true;
            const k = looseKey(t.date, t.direction, t.amountCents);
            const left = looseLeft.get(k) ?? 0;
            if (left === 0) return false;
            looseLeft.set(k, left - 1);
            return true;
          };
        })()
      : (() => {
        const strict = duplicateCounter(existing.map((t) => t.fingerprint));
        return (fp: string) => strict(fp);
      })();

  // Previsões em aberto no período: lançamento `pending` que veio de
  // recorrência. São elas que o extrato pode estar vindo quitar.
  //
  // A janela é esticada em 5 dias nas duas pontas porque a previsão pode
  // cair pouco antes ou depois do dia em que o banco postou.
  const { data: forecastRows } = await supabase
    // limite: previsões pendentes de recorrência no período do extrato
    .from("transactions")
    .select(
      "id, date, amount_cents, direction, recurrence_id, recurrences(frequency)",
    )
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("status", "pending")
    .not("recurrence_id", "is", null)
    .gte("date", shiftDays(statement.periodStart, -5))
    .lte("date", shiftDays(statement.periodEnd, 5))
    .order("date");

  const candidates: ForecastCandidate[] = (forecastRows ?? []).map((f) => {
    const rec = f.recurrences as
      { frequency: string } | { frequency: string }[] | null;
    const frequency = Array.isArray(rec) ? rec[0]?.frequency : rec?.frequency;
    return {
      id: f.id as string,
      date: f.date as string,
      amountCents: f.amount_cents as number,
      direction: f.direction as "in" | "out",
      // Recorrência apagada deixa `recurrence_id` órfão: trata como
      // mensal, que é a janela mais conservadora das duas.
      frequency: (frequency === "weekly" || frequency === "yearly"
        ? frequency
        : "monthly") as "weekly" | "monthly" | "yearly",
    };
  });

  const takenForecasts = new Set<string>();

  // Nomes que esta pessoa já deu a estabelecimentos em importações
  // anteriores. A chave é o nome limpo automático, normalizado.
  const { data: savedNames } = await supabase
    .from("merchant_names")
    .select("bank_key, name")
    .eq("member_id", memberId);
  const nameByKey = new Map(
    (savedNames ?? []).map((n) => [n.bank_key as string, n.name as string]),
  );

  // Categoria que esta pessoa já deu a cada estabelecimento. Vale mais
  // que o código do cartão (MCC): foi ela quem escolheu. Só serve se a
  // categoria ainda existe e é do tipo certo (despesa pra saída).
  const learned = await loadMerchantCategories(supabase, memberId);
  const categoryById = new Map([...categoriesByName.values()].map((c) => [c.id, c]));
  const learnedFor = (description: string, direction: "in" | "out") => {
    const id = learnedCategoryFor(learned, description, direction);
    const category = id ? categoryById.get(id) : undefined;
    if (!category) return null;
    return fitsDirection(category, direction) ? id : null;
  };

  const rows = statement.transactions.map((t, index) => {
    const fingerprint = computeFingerprint({
      accountId,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
    });
    const isDuplicate = isExistingDuplicate(fingerprint, t, index);
    const learnedId = learnedFor(t.description, t.direction);
    const suggested =
      learnedId ?? suggestCategoryId(t.mcc, categoriesByName, t.direction);

    // Duplicata não procura previsão: se essa linha já existe na conta,
    // não é ela que vai quitar previsão nenhuma.
    const match = isDuplicate
      ? null
      : matchForecast(t, candidates, takenForecasts);
    if (match) takenForecasts.add(match.id);

    // Nome pra lista; o texto do banco segue junto, e a impressão digital
    // (acima) continua sendo calculada sobre ele.
    const cleanName = cleanBankDescription(t.description);
    const displayName =
      (isGenericBankText(t.description) ? undefined : nameByKey.get(normalizeDescription(cleanName))) ?? cleanName;

    return {
      import_id: importId,
      date: t.date,
      description: displayName,
      bank_description: t.description,
      amount_cents: t.amountCents,
      direction: t.direction,
      suggested_category_id: suggested,
      // "model": veio do que a pessoa ensinou; "rule": do código do cartão.
      category_source: learnedId
        ? ("model" as const)
        : suggested
          ? ("rule" as const)
          : ("none" as const),
      fingerprint,
      dup_status: isDuplicate ? ("duplicate" as const) : ("none" as const),
      // Duplicata entra desmarcada: o padrão não deve ser duplicar.
      is_included: !isDuplicate,
      match_transaction_id: match?.id ?? null,
      merge_accepted: true,
    };
  });

  // Segundo cruzamento: lançamentos que o usuário já CONFIRMOU à mão.
  // Só nas linhas que sobraram livres — não duplicata, não previsão.
  // Par único vira sugestão DESMARCADA: lançamento confirmado é algo que
  // o usuário afirmou, e juntar só acontece se ele pedir.
  const confirmed = await fetchConfirmedCandidates(
    supabase,
    householdId,
    accountId,
    statement,
  );
  const lines = () =>
    rows.map((r) => ({
      date: r.date,
      amountCents: r.amount_cents,
      direction: r.direction,
      fingerprint: r.fingerprint,
      free: r.dup_status === "none" && r.match_transaction_id === null,
    }));

  // Mesmo dia e valor: o lançamento digitado à mão é esta linha. Junção
  // já marcada — sem isso, quem lançou um mês à mão clicava "Juntar" em
  // cada linha.
  const exact = matchConfirmedExact(lines(), confirmed);
  const exactIds = new Set(exact.values());
  for (const [index, transactionId] of exact) {
    rows[index].match_transaction_id = transactionId;
    rows[index].merge_accepted = true;
  }

  // O resto: valor único com data perto vira sugestão, desmarcada.
  const pairs = matchConfirmed(
    lines(),
    confirmed.filter((c) => !exactIds.has(c.id)),
  );
  for (const [index, transactionId] of pairs) {
    rows[index].match_transaction_id = transactionId;
    rows[index].merge_accepted = false;
  }

  // Terceiro cruzamento: pagamento de fatura de cartão. Só cartões em que
  // quem importa pode lançar (o banco recusaria a outra ponta).
  // (Não vale pra fatura do próprio cartão: ali a linha de pagamento é
  // tratada logo abaixo.)
  const cards = isCard
    ? []
    : (
        await loadCards(supabase, householdId, memberId, todayIn(timezone))
      ).filter((c) => c.canEdit);
  const cardPayments: (string | null)[] = rows.map(() => null);
  const cardAccepted: boolean[] = rows.map(() => false);
  if (cards.length > 0) {
    const existing = await fetchExistingCardPayments(
      supabase,
      householdId,
      accountId,
      cards.map((c) => c.id),
      statement,
    );
    const matches = matchCardPayments(
      accountId,
      rows.map((r) => ({
        date: r.date,
        amountCents: r.amount_cents,
        direction: r.direction,
        description: r.bank_description,
        free: r.dup_status === "none" && r.match_transaction_id === null,
      })),
      cards,
      existing,
    );
    matches.forEach((m, i) => {
      if (!m) return;
      if (m.kind === "already-registered") {
        // Mesmo dinheiro que o "Pagar fatura" do app já registrou.
        rows[i].dup_status = "duplicate";
        rows[i].is_included = false;
        return;
      }
      // O nome "Pagamento da fatura · <cartão>" é dado ao confirmar, se
      // quem revisa mantiver a sugestão.
      cardPayments[i] = m.cardId;
      cardAccepted[i] = m.accepted;
    });
  }
  // Fatura do cartão: a linha "Pagamento" é o mesmo dinheiro que saiu da
  // corrente — já registrado pelo "Pagar fatura" ou pelo extrato da
  // corrente. Se existe essa transferência pro cartão, a linha é duplicata.
  if (isCard) {
    const { data: paymentsIn } = await supabase
      // limite: pagamentos de fatura no período do extrato
      .from("transactions")
      .select("date, amount_cents")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .eq("direction", "in")
      .not("transfer_group_id", "is", null)
      .gte("date", shiftDays(statement.periodStart, -7))
      .lte("date", shiftDays(statement.periodEnd, 7));
    const used = new Set<number>();
    rows.forEach((r) => {
      if (
        r.direction !== "in" ||
        r.dup_status !== "none" ||
        !/pagamento|payment/i.test(r.bank_description)
      )
        return;
      const k = (paymentsIn ?? []).findIndex(
        (p, j) =>
          !used.has(j) &&
          p.amount_cents === r.amount_cents &&
          Math.abs(Date.parse(p.date as string) - Date.parse(r.date)) <=
            7 * 86_400_000,
      );
      if (k >= 0) {
        used.add(k);
        r.dup_status = "duplicate";
        r.is_included = false;
      }
    });
  }

  // Prints: o app mostra o saldo antes do lançamento mais antigo. Se o
  // Velun tem outro saldo nesse ponto, faltam (ou sobram) lançamentos
  // ANTES do print. Lançamentos seus que esta importação substitui ou
  // sugere juntar (ex.: "Fxreplay" lançado à mão no dia 10, que no banco
  // caiu no 13) saem da conta: juntados, passam pra data do banco.
  if (screensBefore !== null) {
    // Inclui as sugestões ainda não aceitas ("Parece ser o mesmo… Juntar"):
    // se não forem juntadas, ficam em dobro — o saldo certo é o de juntar.
    const replacedIds = rows.filter((r) => r.match_transaction_id).map((r) => r.match_transaction_id as string);
    let before = screensBefore;
    if (replacedIds.length > 0) {
      const { data: replaced } = await supabase
        // limite: só os lançamentos casados nesta importação
        .from("transactions")
        .select("date, amount_cents, direction, status")
        .in("id", replacedIds);
      for (const t of replaced ?? []) {
        if (t.status !== "cleared" || (t.date as string) >= statement.periodStart) continue;
        before -= t.direction === "in" ? (t.amount_cents as number) : -(t.amount_cents as number);
      }
    }
    const diff = statement.beginningBalanceCents - before;
    if (Math.abs(diff) >= 1) {
      const fmt = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      const [y, m, d] = statement.periodStart.split("-");
      const note = `Atenção: antes de ${d}/${m}/${y} o app mostra saldo de ${fmt(statement.beginningBalanceCents)} e o Velun tem ${fmt(before)} (diferença de ${fmt(diff)}). Faltam ou sobram lançamentos antes dessa data: importe um print ou extrato dos dias anteriores.`;
      screensNote = screensNote ? `${screensNote} ${note}` : note;
    }
  }

  const stagedRows = rows.map((r, i) => ({
    ...r,
    card_payment_account_id: cardPayments[i],
    card_payment_accepted: cardAccepted[i],
  }));

  const { error: stageError } = await supabase
    .from("staged_transactions")
    .insert(stagedRows);
  if (stageError) {
    // Sem isto sobraria uma revisão vazia — e com a regra de uma revisão
    // por conta, ela travaria qualquer importação seguinte nessa conta.
    await supabase.from("imports").delete().eq("id", importId);
    throw new Error(stageError.message);
  }

  const duplicates = rows.filter((r) => r.dup_status === "duplicate").length;

  let message: string | null = null;
  if (verification.matches === false && !fileInput) {
    message = isCard
      ? "A soma dos lançamentos não fecha com o total da fatura. Revise antes de confirmar."
      : verification.firstDivergence
        ? `O saldo reconstruído diverge do extrato em ${verification.firstDivergence.date}. Revise os lançamentos desse dia antes de confirmar.`
        : "A soma dos lançamentos não fecha com o saldo final do extrato. Revise antes de confirmar.";
  }

  if (cardDaysNote)
    message = message ? `${message} ${cardDaysNote}` : cardDaysNote;
  if (nomadNote) message = message ? `${message} ${nomadNote}` : nomadNote;
  if (fileNote) message = message ? `${fileNote} ${message}` : fileNote;
  if (screensNote) message = message ? `${screensNote} ${message}` : screensNote;

  // Planilha: lembra as colunas pra esta conta. A próxima do mesmo banco
  // (mesmo cabeçalho) entra sem perguntar. Falhar aqui não desfaz nada.
  const mapping = fileInput && fileInput.format !== "ofx" ? validMapping(input.mapping) : null;
  if (mapping && fileInput) {
    await saveImportMapping(supabase, householdId, accountId, fileInput.format, mapping).catch(() => undefined);
  }

  revalidatePath("/importar");
  revalidatePath("/cartoes");

  return {
    ok: true,
    importId,
    matches: verification.matches,
    count: rows.length,
    duplicates,
    message,
  };
}

/**
 * As colunas de planilha moram em `import_profiles` (da 0001, que estava
 * sem uso): `institution` guarda a assinatura do cabeçalho e
 * `column_mapping`, a conta e as colunas.
 */
async function saveImportMapping(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  accountId: string,
  format: string,
  mapping: { signature: string; columns: ColumnMapping },
) {
  const value = { accountId, columns: mapping.columns };
  const { data: existing } = await supabase
    .from("import_profiles")
    .select("id")
    .eq("household_id", householdId)
    .eq("institution", mapping.signature)
    .eq("column_mapping->>accountId", accountId)
    .limit(1);
  if (existing && existing.length > 0) {
    await supabase
      .from("import_profiles")
      .update({ column_mapping: value, date_format: mapping.columns.dateFormat, file_type: format })
      .eq("id", existing[0].id as string);
    return;
  }
  await supabase.from("import_profiles").insert({
    household_id: householdId,
    institution: mapping.signature,
    file_type: format,
    column_mapping: value,
    date_format: mapping.columns.dateFormat,
  });
}

/**
 * Colunas lembradas pra uma planilha com esse cabeçalho: as desta conta,
 * ou, se ela nunca recebeu esse formato, as de outra conta da casa.
 */
export async function getImportMapping(accountId: string, signature: string): Promise<ColumnMapping | null> {
  try {
    if (typeof accountId !== "string" || typeof signature !== "string" || signature.length > 400) return null;
    const { householdId } = await getCurrentMember();
    const supabase = await createClient();
    const { data } = await supabase
      .from("import_profiles")
      .select("column_mapping, created_at")
      .eq("household_id", householdId)
      .eq("institution", signature)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []).map((r) => r.column_mapping as { accountId?: string; columns?: unknown });
    const own = rows.find((r) => r.accountId === accountId) ?? rows[0];
    return own ? (validMapping({ signature, columns: own.columns })?.columns ?? null) : null;
  } catch {
    return null;
  }
}

/** Transforma o que está marcado na revisão em transações de verdade. */
export async function confirmImport(importId: string): Promise<ActionResult> {
  return attempt("Não consegui confirmar a importação.", () =>
    runConfirmImport(importId),
  );
}

async function runConfirmImport(importId: string) {
  const supabase = await createClient();

  // Tudo acontece numa função do banco (migração 0013), que roda como
  // uma transação só: junta as previsões, grava os lançamentos e marca a
  // importação — ou não faz nada. E trava a importação no começo, então
  // um segundo clique espera o primeiro e encontra a importação já
  // confirmada.
  //
  // Antes eram chamadas soltas daqui, e na importação de setembro a
  // primeira tentativa gravou os lançamentos e morreu antes de marcar a
  // importação. O segundo clique gravou tudo de novo.
  const { error } = await supabase.rpc("confirm_import", {
    p_import_id: importId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}

/** Marca ou desmarca uma linha da revisão. */
export async function toggleStagedRow(
  stagedId: string,
  isIncluded: boolean,
): Promise<ActionResult> {
  return attempt("Não consegui marcar essa linha.", () =>
    runToggleStagedRow(stagedId, isIncluded),
  );
}

async function runToggleStagedRow(stagedId: string, isIncluded: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staged_transactions")
    .update({ is_included: isIncluded })
    .eq("id", stagedId);

  if (error) throw new Error(error.message);
  revalidatePath("/importar");
}

/**
 * Responde o "essa linha parece ser a sua recorrência X": juntar ou
 * tratar como lançamento separado.
 */
export async function setStagedMerge(
  stagedId: string,
  accepted: boolean,
): Promise<ActionResult> {
  return attempt("Não consegui mudar o cruzamento dessa linha.", () =>
    runSetStagedMerge(stagedId, accepted),
  );
}

async function runSetStagedMerge(stagedId: string, accepted: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staged_transactions")
    .update({ merge_accepted: accepted })
    .eq("id", stagedId);

  if (error) throw new Error(error.message);
  revalidatePath("/importar");
}

/** Aceita ou recusa a sugestão "esta linha é pagamento da fatura do cartão". */
export async function setStagedCardPayment(
  stagedId: string,
  accepted: boolean,
): Promise<ActionResult> {
  return attempt("Não consegui mudar essa linha.", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("staged_transactions")
      .update({ card_payment_accepted: accepted })
      .eq("id", stagedId);
    if (error) throw new Error(error.message);
    revalidatePath("/importar");
  });
}

/**
 * Apaga uma previsão que o extrato não confirmou.
 *
 * Existe porque o cruzamento automático só junta o caso óbvio — valor
 * exato e data colada. Previsão paga em duas transferências, ou com
 * valor diferente do previsto, chega na revisão sem par, e sem isso ela
 * ficaria pra sempre somando no mês ao lado do dinheiro de verdade.
 *
 * Só apaga previsão: `status` pendente e vinda de recorrência. Nunca
 * encosta em lançamento confirmado.
 */
export async function dismissForecast(
  transactionId: string,
): Promise<ActionResult> {
  return attempt("Não consegui apagar essa previsão.", () =>
    runDismissForecast(transactionId),
  );
}

async function runDismissForecast(transactionId: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("household_id", householdId)
    .eq("status", "pending")
    .not("recurrence_id", "is", null);

  if (error) throw new Error(error.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/a-pagar");
  revalidatePath("/mes");
  revalidatePath("/fluxo-de-caixa");
}

/**
 * Troca a categoria de uma linha da revisão. As outras linhas do mesmo
 * estabelecimento (e mesma direção) que ainda não foram escolhidas na mão
 * ganham a mesma categoria, marcadas como automáticas, e a escolha fica
 * lembrada pras próximas importações. Devolve quantas foram junto.
 */
export async function setStagedCategory(
  stagedId: string,
  categoryId: string | null,
): Promise<ActionResult & { alsoUpdated?: number }> {
  let alsoUpdated = 0;
  const result = await attempt("Não consegui trocar a categoria.", async () => {
    alsoUpdated = await runSetStagedCategory(stagedId, categoryId);
  });
  return result.ok ? { ...result, alsoUpdated } : result;
}

async function runSetStagedCategory(
  stagedId: string,
  categoryId: string | null,
): Promise<number> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("staged_transactions")
    .select("id, import_id, description, bank_description, direction")
    .eq("id", stagedId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Linha não encontrada.");

  const { error } = await supabase
    .from("staged_transactions")
    .update({ suggested_category_id: categoryId, category_source: "manual" })
    .eq("id", stagedId);
  if (error) throw new Error(error.message);

  const bank =
    (row.bank_description as string | null) ?? (row.description as string);
  const direction = row.direction as "in" | "out";

  await rememberMerchantCategory(supabase, {
    householdId,
    memberId,
    bankDescription: bank,
    direction,
    categoryId,
  });

  // "Sem categoria" só esquece; não apaga o que as outras linhas têm.
  let updated = 0;
  if (categoryId && merchantKey(bank)) {
    const { data: siblings, error: siblingsError } = await supabase
      .from("staged_transactions")
      .select("id, description, bank_description, direction, category_source, card_payment_account_id, card_payment_accepted")
      .eq("import_id", row.import_id);
    if (siblingsError) throw new Error(siblingsError.message);

    const ids = sameMerchantRows(
      (siblings ?? []).map((s) => ({
        id: s.id as string,
        bankDescription:
          (s.bank_description as string | null) ?? (s.description as string),
        direction: s.direction as "in" | "out",
        // Escolhida na mão, ou pagamento de fatura (vira transferência,
        // não leva categoria): não mexe.
        locked:
          s.category_source === "manual" ||
          (s.card_payment_account_id != null && s.card_payment_accepted === true),
      })),
      { id: stagedId, bankDescription: bank, direction },
    ).map((s) => s.id);

    if (ids.length > 0) {
      const { error: updError } = await supabase
        .from("staged_transactions")
        .update({ suggested_category_id: categoryId, category_source: "model" })
        .in("id", ids);
      if (updError) throw new Error(updError.message);
      updated = ids.length;
    }
  }

  revalidatePath("/importar");
  return updated;
}

/** Ids de linhas da revisão vindos do navegador: confere o formato. */
function validIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 5000) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ids.every((id) => typeof id === "string" && uuid.test(id)) ? [...new Set(ids as string[])] : null;
}

/** Em pedaços: lista longa de ids estoura o tamanho do endereço da consulta. */
function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Marca ou desmarca várias linhas da revisão de uma vez. */
export async function bulkSetStagedIncluded(
  importId: string,
  ids: string[],
  isIncluded: boolean,
): Promise<ActionResult> {
  return attempt(isIncluded ? "Não consegui marcar essas linhas." : "Não consegui desmarcar essas linhas.", async () => {
    const clean = validIds(ids);
    if (!clean || typeof importId !== "string") throw new Error("Seleção inválida.");
    const supabase = await createClient();
    for (const part of chunks(clean)) {
      const { error } = await supabase
        .from("staged_transactions")
        .update({ is_included: isIncluded })
        .eq("import_id", importId)
        .in("id", part);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/importar");
  });
}

/**
 * Põe a mesma categoria em várias linhas da revisão. Linha em que a
 * categoria não serve (receita numa saída) ou que é pagamento de fatura
 * (vira transferência) fica como estava — e volta contada em `skipped`.
 * A escolha vale como feita na mão: fica lembrada por estabelecimento.
 */
export async function bulkSetStagedCategory(
  importId: string,
  ids: string[],
  categoryId: string | null,
): Promise<ActionResult & { changed?: number; skipped?: number }> {
  let changed = 0;
  let skipped = 0;
  const result = await attempt("Não consegui trocar a categoria dessas linhas.", async () => {
    const clean = validIds(ids);
    if (!clean || typeof importId !== "string") throw new Error("Seleção inválida.");
    const { householdId, memberId } = await getCurrentMember();
    const supabase = await createClient();

    let category: { kind: string; is_transfer: boolean | null } | null = null;
    if (categoryId) {
      const { data } = await supabase
        .from("categories")
        .select("kind, is_transfer")
        .eq("id", categoryId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (!data) throw new Error("Categoria não encontrada.");
      category = data as { kind: string; is_transfer: boolean | null };
    }

    const rows: {
      id: string;
      description: string;
      bank_description: string | null;
      direction: "in" | "out";
      card_payment_account_id: string | null;
      card_payment_accepted: boolean | null;
    }[] = [];
    for (const part of chunks(clean)) {
      const { data, error } = await supabase
        .from("staged_transactions")
        .select("id, description, bank_description, direction, card_payment_account_id, card_payment_accepted")
        .eq("import_id", importId)
        .in("id", part);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as typeof rows));
    }

    const target = rows.filter(
      (r) =>
        !(r.card_payment_account_id != null && r.card_payment_accepted === true) &&
        (!category || fitsDirection(category, r.direction)),
    );
    skipped = rows.length - target.length;

    for (const part of chunks(target.map((r) => r.id))) {
      const { error } = await supabase
        .from("staged_transactions")
        .update({ suggested_category_id: categoryId, category_source: "manual" })
        .eq("import_id", importId)
        .in("id", part);
      if (error) throw new Error(error.message);
    }
    changed = target.length;

    // Lembra (ou esquece) por estabelecimento, uma vez cada.
    const seen = new Set<string>();
    for (const r of target) {
      const bank = r.bank_description ?? r.description;
      const key = `${merchantKey(bank)}|${r.direction}`;
      if (!merchantKey(bank) || seen.has(key)) continue;
      seen.add(key);
      await rememberMerchantCategory(supabase, {
        householdId,
        memberId,
        bankDescription: bank,
        direction: r.direction,
        categoryId,
      });
    }
    revalidatePath("/importar");
  });
  return result.ok ? { ...result, changed, skipped } : result;
}

/**
 * Renomeia uma linha da revisão. As outras linhas do mesmo
 * estabelecimento nesta importação ganham o mesmo nome, e o nome fica
 * lembrado pras próximas importações.
 */
export async function renameStagedRow(
  stagedId: string,
  name: string,
): Promise<ActionResult> {
  return attempt("Não consegui renomear.", () =>
    runRenameStagedRow(stagedId, name),
  );
}

async function runRenameStagedRow(stagedId: string, rawName: string) {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("O nome não pode ficar vazio.");
  if (name.length > 200) throw new Error("Nome comprido demais.");

  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("staged_transactions")
    .select("id, import_id, description, bank_description")
    .eq("id", stagedId)
    .maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Linha não encontrada.");

  const bank =
    (row.bank_description as string | null) ?? (row.description as string);
  const key = normalizeDescription(cleanBankDescription(bank));

  const { data: siblings, error: siblingsError } = await supabase
    .from("staged_transactions")
    .select("id, description, bank_description")
    .eq("import_id", row.import_id);
  if (siblingsError) throw new Error(siblingsError.message);

  const ids = (siblings ?? [])
    .filter((s) => {
      const sBank =
        (s.bank_description as string | null) ?? (s.description as string);
      return (
        s.id === stagedId ||
        normalizeDescription(cleanBankDescription(sBank)) === key
      );
    })
    .map((s) => s.id as string);

  const { error } = await supabase
    .from("staged_transactions")
    .update({ description: name })
    .in("id", ids);
  if (error) throw new Error(error.message);

  await rememberMerchantName(supabase, {
    householdId,
    memberId,
    bankDescription: bank,
    name,
  });
  revalidatePath("/importar");
}

/** Descarta uma importação em revisão sem criar nada. */
export async function discardImport(importId: string): Promise<ActionResult> {
  return attempt("Não consegui descartar a importação.", () =>
    runDiscardImport(importId),
  );
}

async function runDiscardImport(importId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) throw new Error(error.message);
  revalidatePath("/importar");
}

/**
 * Desfaz uma importação já confirmada: apaga os lançamentos que ela
 * criou e o registro da importação.
 *
 * A ordem importa. `transactions.import_id` é `on delete set null`, não
 * `cascade`: apagar só a importação deixaria os lançamentos no
 * histórico sem nenhuma marca de onde vieram — órfãos impossíveis de
 * desfazer depois. Então os lançamentos vão primeiro.
 *
 * Lançamento editado à mão depois de importado também vai embora. É o
 * preço de ter um desfazer de verdade, e a tela avisa quantos são antes
 * de perguntar.
 */
export async function undoImport(importId: string): Promise<ActionResult> {
  return attempt("Não consegui desfazer a importação.", () =>
    runUndoImport(importId),
  );
}

async function runUndoImport(importId: string) {
  const supabase = await createClient();

  // Mesma razão do confirmar: restaurar as previsões, apagar os
  // lançamentos e apagar a importação acontecem juntos ou não acontecem.
  // Desfazer pela metade deixaria lançamento sem importação, que nenhum
  // desfazer posterior alcança.
  const { error } = await supabase.rpc("undo_import", {
    p_import_id: importId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}
