"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { computeFingerprint } from "@/lib/fingerprint";
import { parseRegionsStatementText, StatementParseError } from "@/lib/import/regions-pdf";
import { verifyStatement } from "@/lib/import/verify";
import { suggestCategoryId } from "@/lib/import/mcc";

const MAX_TEXT_LENGTH = 2 * 1024 * 1024;

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

  const rows = statement.transactions.map((t) => {
    const fingerprint = computeFingerprint({
      accountId,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
    });
    const isDuplicate = existingFingerprints.has(fingerprint);
    const suggested = suggestCategoryId(t.mcc, categoriesByName);

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
    .select("date, description, amount_cents, direction, suggested_category_id, fingerprint")
    .eq("import_id", importId)
    .eq("is_included", true);

  if (stagedError) throw new Error(stagedError.message);

  if ((staged ?? []).length > 0) {
    const { error: insertError } = await supabase.from("transactions").insert(
      (staged ?? []).map((s) => ({
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
