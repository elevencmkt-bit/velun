"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { computeFingerprint } from "@/lib/fingerprint";
import { parseRegionsStatementText, StatementParseError } from "@/lib/import/regions-pdf";
import { verifyStatement } from "@/lib/import/verify";
import { suggestCategoryId } from "@/lib/import/mcc";
import { matchForecast, type ForecastCandidate } from "@/lib/import/match-forecast";
import { matchConfirmed } from "@/lib/import/match-confirmed";
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
      matches: boolean;
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
export type ActionResult = { ok: true } | { ok: false; error: string; detail?: string };

/**
 * Roda a ação e traduz qualquer exceção em resultado.
 *
 * `error` é a frase pra quem está usando; `detail` é a mensagem técnica,
 * que a tela mostra embaixo em letra miúda. Sem o detalhe, erro de banco
 * vira "algo deu errado" e a depuração depende de acesso ao log — o que
 * não serve nem pra mim nem pra quem for usar isso depois.
 */
async function attempt(error: string, fn: () => Promise<void>): Promise<ActionResult> {
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
  text: string;
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

async function runImportStatement(input: {
  accountId: string;
  fileName: string;
  text: string;
}): Promise<ImportResult> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { accountId, fileName, text } = input;

  // Falhas previsíveis voltam como resultado, não como exceção: o Next
  // mascara erro de server action em produção, e o usuário acabaria
  // vendo um código do React no lugar da causa.
  if (!accountId) return { ok: false, error: "Escolha a conta do extrato." };
  if (!text.trim()) {
    return {
      ok: false,
      error: "Não consegui ler texto nesse PDF. Ele pode ser um documento escaneado.",
    };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: "Esse extrato é grande demais para importar de uma vez." };
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

  let statement;
  try {
    statement = parseRegionsStatementText(text);
  } catch (err) {
    if (err instanceof StatementParseError) return { ok: false, error: err.message };
    throw err;
  }

  const verification = verifyStatement(statement);

  // O nome do arquivo é registrado, não o conteúdo: o PDF não é guardado
  // em lugar nenhum. O que fica é o que foi extraído e revisado.
  const { data: created, error: importError } = await supabase
    .from("imports")
    .insert({
      household_id: householdId,
      account_id: accountId,
      file_path: fileName,
      file_type: "pdf",
      status: "review",
      statement_start: statement.periodStart,
      statement_end: statement.periodEnd,
      closing_balance_cents: statement.endingBalanceCents,
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
        error: "Já tem um extrato em revisão nessa conta. Confirme ou descarte antes de importar outro.",
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
    .select("id, name, kind")
    .eq("household_id", householdId)
    .eq("is_archived", false);

  const categoriesByName = new Map(
    (categories ?? []).map((c) => [
      (c.name as string).toLowerCase(),
      { id: c.id as string, kind: c.kind as string },
    ]),
  );

  // Fingerprints já existentes nessa conta, pra marcar duplicata. O
  // mesmo cálculo do lançamento manual, então extrato e digitação são
  // comparáveis.
  const { data: existing } = await supabase
    .from("transactions")
    .select("fingerprint")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .gte("date", statement.periodStart)
    .lte("date", statement.periodEnd);

  const existingFingerprints = new Set((existing ?? []).map((t) => t.fingerprint as string));

  // Previsões em aberto no período: lançamento `pending` que veio de
  // recorrência. São elas que o extrato pode estar vindo quitar.
  //
  // A janela é esticada em 5 dias nas duas pontas porque a previsão pode
  // cair pouco antes ou depois do dia em que o banco postou.
  const { data: forecastRows } = await supabase
    .from("transactions")
    .select("id, date, amount_cents, direction, recurrence_id, recurrences(frequency)")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("status", "pending")
    .not("recurrence_id", "is", null)
    .gte("date", shiftDays(statement.periodStart, -5))
    .lte("date", shiftDays(statement.periodEnd, 5))
    .order("date");

  const candidates: ForecastCandidate[] = (forecastRows ?? []).map((f) => {
    const rec = f.recurrences as { frequency: string } | { frequency: string }[] | null;
    const frequency = Array.isArray(rec) ? rec[0]?.frequency : rec?.frequency;
    return {
      id: f.id as string,
      date: f.date as string,
      amountCents: f.amount_cents as number,
      direction: f.direction as "in" | "out",
      // Recorrência apagada deixa `recurrence_id` órfão: trata como
      // mensal, que é a janela mais conservadora das duas.
      frequency: (frequency === "weekly" || frequency === "yearly" ? frequency : "monthly") as
        | "weekly"
        | "monthly"
        | "yearly",
    };
  });

  const takenForecasts = new Set<string>();

  const rows = statement.transactions.map((t) => {
    const fingerprint = computeFingerprint({
      accountId,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
    });
    const isDuplicate = existingFingerprints.has(fingerprint);
    const suggested = suggestCategoryId(t.mcc, categoriesByName, t.direction);

    // Duplicata não procura previsão: se essa linha já existe na conta,
    // não é ela que vai quitar previsão nenhuma.
    const match = isDuplicate ? null : matchForecast(t, candidates, takenForecasts);
    if (match) takenForecasts.add(match.id);

    return {
      import_id: importId,
      date: t.date,
      description: t.description,
      amount_cents: t.amountCents,
      direction: t.direction,
      suggested_category_id: suggested,
      category_source: suggested ? ("rule" as const) : ("none" as const),
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
  const confirmed = await fetchConfirmedCandidates(supabase, householdId, accountId, statement);
  const pairs = matchConfirmed(
    rows.map((r) => ({
      date: r.date,
      amountCents: r.amount_cents,
      direction: r.direction,
      fingerprint: r.fingerprint,
      free: r.dup_status === "none" && r.match_transaction_id === null,
    })),
    confirmed,
  );
  for (const [index, transactionId] of pairs) {
    rows[index].match_transaction_id = transactionId;
    rows[index].merge_accepted = false;
  }

  const { error: stageError } = await supabase.from("staged_transactions").insert(rows);
  if (stageError) {
    // Sem isto sobraria uma revisão vazia — e com a regra de uma revisão
    // por conta, ela travaria qualquer importação seguinte nessa conta.
    await supabase.from("imports").delete().eq("id", importId);
    throw new Error(stageError.message);
  }

  const duplicates = rows.filter((r) => r.dup_status === "duplicate").length;

  let message: string | null = null;
  if (!verification.matches) {
    message = verification.firstDivergence
      ? `O saldo reconstruído diverge do extrato em ${verification.firstDivergence.date}. Revise os lançamentos desse dia antes de confirmar.`
      : "A soma dos lançamentos não fecha com o saldo final do extrato. Revise antes de confirmar.";
  }

  revalidatePath("/importar");

  return {
    ok: true,
    importId,
    matches: verification.matches,
    count: rows.length,
    duplicates,
    message,
  };
}

/** Transforma o que está marcado na revisão em transações de verdade. */
export async function confirmImport(importId: string): Promise<ActionResult> {
  return attempt('Não consegui confirmar a importação.', () => runConfirmImport(importId));
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
  const { error } = await supabase.rpc("confirm_import", { p_import_id: importId });
  if (error) throw new Error(error.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}

/** Marca ou desmarca uma linha da revisão. */
export async function toggleStagedRow(stagedId: string, isIncluded: boolean): Promise<ActionResult> {
  return attempt('Não consegui marcar essa linha.', () => runToggleStagedRow(stagedId, isIncluded));
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
export async function setStagedMerge(stagedId: string, accepted: boolean): Promise<ActionResult> {
  return attempt('Não consegui mudar o cruzamento dessa linha.', () => runSetStagedMerge(stagedId, accepted));
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
export async function dismissForecast(transactionId: string): Promise<ActionResult> {
  return attempt('Não consegui apagar essa previsão.', () => runDismissForecast(transactionId));
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

/** Troca a categoria sugerida de uma linha da revisão. */
export async function setStagedCategory(stagedId: string, categoryId: string | null): Promise<ActionResult> {
  return attempt('Não consegui trocar a categoria.', () => runSetStagedCategory(stagedId, categoryId));
}

async function runSetStagedCategory(stagedId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staged_transactions")
    .update({ suggested_category_id: categoryId, category_source: "manual" })
    .eq("id", stagedId);

  if (error) throw new Error(error.message);
  revalidatePath("/importar");
}

/** Descarta uma importação em revisão sem criar nada. */
export async function discardImport(importId: string): Promise<ActionResult> {
  return attempt('Não consegui descartar a importação.', () => runDiscardImport(importId));
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
  return attempt('Não consegui desfazer a importação.', () => runUndoImport(importId));
}

async function runUndoImport(importId: string) {
  const supabase = await createClient();

  // Mesma razão do confirmar: restaurar as previsões, apagar os
  // lançamentos e apagar a importação acontecem juntos ou não acontecem.
  // Desfazer pela metade deixaria lançamento sem importação, que nenhum
  // desfazer posterior alcança.
  const { error } = await supabase.rpc("undo_import", { p_import_id: importId });
  if (error) throw new Error(error.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}
