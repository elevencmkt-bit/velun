"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { computeFingerprint } from "@/lib/fingerprint";
import { parseRegionsStatementText, StatementParseError } from "@/lib/import/regions-pdf";
import { verifyStatement } from "@/lib/import/verify";
import { suggestCategoryId } from "@/lib/import/mcc";
import { matchForecast, type ForecastCandidate } from "@/lib/import/match-forecast";

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

  if (importError) throw new Error(importError.message);
  const importId = created.id as string;

  // Categorias do household, por nome, pro casamento com o MCC.
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("is_archived", false);

  const categoriesByName = new Map(
    (categories ?? []).map((c) => [(c.name as string).toLowerCase(), c.id as string]),
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
    const suggested = suggestCategoryId(t.mcc, categoriesByName);

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

  const { error: stageError } = await supabase.from("staged_transactions").insert(rows);
  if (stageError) throw new Error(stageError.message);

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
export async function confirmImport(importId: string) {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { data: imp, error: impError } = await supabase
    .from("imports")
    .select("id, account_id, status")
    .eq("id", importId)
    .single();

  if (impError) throw new Error(impError.message);
  if (imp.status === "confirmed") throw new Error("Esta importação já foi confirmada.");

  const { data: staged, error: stagedError } = await supabase
    .from("staged_transactions")
    .select(
      "id, date, description, amount_cents, direction, suggested_category_id, fingerprint, match_transaction_id, merge_accepted",
    )
    .eq("import_id", importId)
    .eq("is_included", true);

  if (stagedError) throw new Error(stagedError.message);

  const toMerge = (staged ?? []).filter((s) => s.match_transaction_id && s.merge_accepted);
  const toInsert = (staged ?? []).filter((s) => !(s.match_transaction_id && s.merge_accepted));

  // --- junção: a previsão é quitada pelo lançamento real -----------------
  //
  // Vira UPDATE na transação que já existe, não um par
  // apagar-e-inserir. Assim o id, o vínculo com a recorrência e a
  // categoria que o usuário escolheu sobrevivem, e nada mais no banco
  // que aponte pra essa transação quebra.
  //
  // Quem ganha o quê:
  // - data e valor: o banco. Ele é o fato; a previsão era um palpite.
  // - descrição: a da previsão ("Spectrum Internet" em vez de "Card
  //   Purchase Spectrum 4899 ..."). Quem cadastrou escolheu um nome
  //   legível, e perder isso piora a tela toda.
  // - categoria: a da previsão quando tem. Escolha do usuário ganha de
  //   sugestão por código de MCC.
  // - texto do banco: vai pra `notes`, pra não sumir.
  for (const row of toMerge) {
    const { data: previous, error: previousError } = await supabase
      .from("transactions")
      .select("id, date, amount_cents, description, notes, status, category_id")
      .eq("id", row.match_transaction_id as string)
      .maybeSingle();

    if (previousError) throw new Error(previousError.message);

    // Previsão apagada entre a importação e a confirmação: não há o que
    // juntar, então entra como lançamento novo.
    if (!previous) {
      toInsert.push(row);
      continue;
    }

    // Guardado ANTES de sobrescrever: é o que o desfazer restaura.
    const { error: snapshotError } = await supabase
      .from("staged_transactions")
      .update({
        match_previous: {
          date: previous.date,
          amount_cents: previous.amount_cents,
          description: previous.description,
          notes: previous.notes,
          status: previous.status,
          category_id: previous.category_id,
        },
      })
      .eq("id", row.id as string);

    if (snapshotError) throw new Error(snapshotError.message);

    const { error: mergeError } = await supabase
      .from("transactions")
      .update({
        date: row.date,
        amount_cents: row.amount_cents,
        status: "cleared",
        category_id: previous.category_id ?? row.suggested_category_id,
        // Observação que o usuário tinha escrito vem primeiro; o texto
        // do banco entra abaixo em vez de apagá-la.
        notes: [previous.notes, row.description].filter(Boolean).join("\n"),
        fingerprint: row.fingerprint,
        import_id: importId,
      })
      .eq("id", previous.id as string);

    if (mergeError) throw new Error(mergeError.message);
  }

  // --- o resto entra como lançamento novo --------------------------------
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("transactions").insert(
      toInsert.map((s) => ({
        household_id: householdId,
        account_id: imp.account_id,
        category_id: s.suggested_category_id,
        date: s.date,
        amount_cents: s.amount_cents,
        direction: s.direction,
        description: s.description,
        status: "cleared",
        fingerprint: s.fingerprint,
        import_id: importId,
        created_by: memberId,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  const { error: doneError } = await supabase
    .from("imports")
    .update({ status: "confirmed" })
    .eq("id", importId);

  if (doneError) throw new Error(doneError.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}

/** Marca ou desmarca uma linha da revisão. */
export async function toggleStagedRow(stagedId: string, isIncluded: boolean) {
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
export async function setStagedMerge(stagedId: string, accepted: boolean) {
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
export async function dismissForecast(transactionId: string) {
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
export async function setStagedCategory(stagedId: string, categoryId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staged_transactions")
    .update({ suggested_category_id: categoryId, category_source: "manual" })
    .eq("id", stagedId);

  if (error) throw new Error(error.message);
  revalidatePath("/importar");
}

/** Descarta uma importação em revisão sem criar nada. */
export async function discardImport(importId: string) {
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
export async function undoImport(importId: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { data: imp, error: loadError } = await supabase
    .from("imports")
    .select("account_id")
    .eq("id", importId)
    .single();

  if (loadError) throw new Error(loadError.message);
  const accountId = imp.account_id as string;

  // Previsão que foi quitada por junção volta ao que era, em vez de ser
  // apagada: aquela transação existia antes da importação e não é dela
  // pra apagar. O estado anterior ficou guardado em `match_previous` na
  // hora da junção — lido agora, porque apagar a importação leva o
  // staging em cascata.
  const { data: merged, error: mergedError } = await supabase
    .from("staged_transactions")
    .select("match_transaction_id, match_previous")
    .eq("import_id", importId)
    .not("match_previous", "is", null);

  if (mergedError) throw new Error(mergedError.message);

  const restoredIds: string[] = [];

  for (const row of merged ?? []) {
    const id = row.match_transaction_id as string | null;
    const previous = row.match_previous as {
      date: string;
      amount_cents: number;
      description: string;
      notes: string | null;
      status: "pending" | "cleared";
      category_id: string | null;
    } | null;

    if (!id || !previous) continue;

    const { error: restoreError } = await supabase
      .from("transactions")
      .update({
        date: previous.date,
        amount_cents: previous.amount_cents,
        description: previous.description,
        notes: previous.notes,
        status: previous.status,
        category_id: previous.category_id,
        import_id: null,
        // A impressão digital acompanha data, valor e descrição: voltando
        // os três, ela tem que voltar também, senão a previsão restaurada
        // não é mais reconhecida como duplicata de si mesma.
        fingerprint: computeFingerprint({
          accountId,
          date: previous.date,
          amountCents: previous.amount_cents,
          description: previous.description,
        }),
      })
      .eq("id", id)
      .eq("household_id", householdId);

    if (restoreError) throw new Error(restoreError.message);
    restoredIds.push(id);
  }

  // Só os lançamentos que a importação criou. As previsões restauradas
  // já tiveram `import_id` zerado acima, então ficam de fora — mas a
  // exclusão é explícita por segurança, pra uma restauração que falhe no
  // meio não virar lançamento apagado.
  let deleteQuery = supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId)
    .eq("import_id", importId);

  if (restoredIds.length > 0) {
    deleteQuery = deleteQuery.not("id", "in", `(${restoredIds.join(",")})`);
  }

  const { error: txError } = await deleteQuery;
  if (txError) throw new Error(txError.message);

  const { error: deleteImportError } = await supabase
    .from("imports")
    .delete()
    .eq("id", importId);

  if (deleteImportError) throw new Error(deleteImportError.message);

  revalidatePath("/importar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/relatorios");
  revalidatePath("/fluxo-de-caixa");
}
