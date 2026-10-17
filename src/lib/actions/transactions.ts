"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { parseToCents } from "@/lib/money";
import { computeFingerprint } from "@/lib/fingerprint";
import { clampedDate, MAX_INSTALLMENTS } from "@/lib/credit-card";
import { rememberMerchantName } from "@/lib/merchant-names";
import { merchantKey, rememberMerchantCategory } from "@/lib/merchant-categories";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  createRecurrenceFromAnchor,
  replaceFutureOccurrences,
  type RecurrenceTemplate,
} from "@/lib/materialize-occurrences";
import { recurrenceScopes, type RecurrenceFrequency, type RecurrenceScope } from "@/lib/recurrence";

// Se o box de lançamento/edição marcou "repetir esse lançamento",
// devolve a frequência escolhida; senão null (fluxo sem recorrência).
function parseRecurrenceInput(
  formData: FormData,
): { frequency: RecurrenceFrequency; endsOn: string | null } | null {
  if (formData.get("make_recurring") !== "on") return null;

  const frequency = String(
    formData.get("recurrence_frequency") ?? "",
  ) as RecurrenceFrequency;
  if (!["monthly", "weekly", "yearly"].includes(frequency)) {
    throw new Error("Frequência de recorrência inválida.");
  }

  return {
    frequency,
    endsOn: String(formData.get("recurrence_ends_on") ?? "") || null,
  };
}

export async function createTransaction(formData: FormData) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const accountId = String(formData.get("account_id") ?? "");
  const categoryIdRaw = String(formData.get("category_id") ?? "");
  const categoryId = categoryIdRaw || null;
  const date = String(formData.get("date") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const isPending = formData.get("is_pending") === "on";
  const amountInput = String(formData.get("amount") ?? "");

  if (!accountId) throw new Error("Conta é obrigatória.");
  if (direction !== "in" && direction !== "out")
    throw new Error("Direção inválida.");
  if (!date) throw new Error("Data é obrigatória.");
  if (!description) throw new Error("Descrição é obrigatória.");

  const amountCents = parseToCents(amountInput);
  if (amountCents <= 0) throw new Error("Valor precisa ser maior que zero.");

  // Verifica que a conta pertence ao household do usuário — RLS já
  // impede o insert, mas aqui dá um erro legível em vez de 403 mudo.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!account) throw new Error("Conta não encontrada neste household.");

  // Compra parcelada no cartão: vira N lançamentos, um por mês, cada um
  // na fatura do seu mês. Centavos que sobram da divisão vão na primeira.
  const installments = Number(formData.get("installments") ?? "1");
  if (
    account.type === "credit_card" &&
    direction === "out" &&
    Number.isInteger(installments) &&
    installments > 1
  ) {
    if (installments > MAX_INSTALLMENTS) throw new Error(`No máximo ${MAX_INSTALLMENTS} parcelas.`);
    const base = Math.floor(amountCents / installments);
    const groupId = crypto.randomUUID();
    const [y, m, d] = date.split("-").map(Number);
    const rows = Array.from({ length: installments }, (_, i) => {
      const parcelDate = clampedDate(y, m - 1 + i, d);
      const parcelCents =
        i === 0 ? amountCents - base * (installments - 1) : base;
      return {
        household_id: householdId,
        account_id: accountId,
        category_id: categoryId,
        date: parcelDate,
        amount_cents: parcelCents,
        direction,
        description,
        notes,
        status: "cleared" as const,
        fingerprint: computeFingerprint({
          accountId,
          date: parcelDate,
          amountCents: parcelCents,
          description: `${description} ${i + 1}/${installments}`,
        }),
        created_by: memberId,
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: installments,
      };
    });
    const { error: instError } = await supabase
      .from("transactions")
      .insert(rows);
    if (instError) throw new Error(instError.message);
    for (const path of [
      "/transacoes",
      "/contas",
      "/mes",
      "/a-pagar",
      "/cartoes",
    ])
      revalidatePath(path);
    return;
  }

  const fingerprint = computeFingerprint({
    accountId,
    date,
    amountCents,
    description,
  });
  const recurrenceInput = parseRecurrenceInput(formData);

  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
      household_id: householdId,
      account_id: accountId,
      category_id: categoryId,
      date,
      amount_cents: amountCents,
      direction,
      description,
      notes,
      status: isPending ? "pending" : "cleared",
      fingerprint,
      created_by: memberId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (recurrenceInput) {
    const recurrenceId = await createRecurrenceFromAnchor({
      householdId,
      memberId,
      template: {
        account_id: accountId,
        category_id: categoryId,
        direction,
        amount_cents: amountCents,
        description,
        notes,
      },
      frequency: recurrenceInput.frequency,
      anchorDate: date,
      endsOn: recurrenceInput.endsOn,
    });
    const { error: linkError } = await supabase
      .from("transactions")
      .update({ recurrence_id: recurrenceId })
      .eq("id", inserted.id);
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/a-pagar");
}

export async function updateTransaction(
  transactionId: string,
  formData: FormData,
) {
  const { memberId, householdId, today } = await getCurrentMember();
  const supabase = await createClient();

  const accountId = String(formData.get("account_id") ?? "");
  const categoryIdRaw = String(formData.get("category_id") ?? "");
  const categoryId = categoryIdRaw || null;
  const date = String(formData.get("date") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const isPending = formData.get("is_pending") === "on";
  const amountInput = String(formData.get("amount") ?? "");

  if (!accountId) throw new Error("Conta é obrigatória.");
  if (direction !== "in" && direction !== "out")
    throw new Error("Direção inválida.");
  if (!date) throw new Error("Data é obrigatória.");
  if (!description) throw new Error("Descrição é obrigatória.");

  const amountCents = parseToCents(amountInput);
  if (amountCents <= 0) throw new Error("Valor precisa ser maior que zero.");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!account) throw new Error("Conta não encontrada neste household.");

  const { data: current } = await supabase
    .from("transactions")
    .select("recurrence_id, description, bank_description, category_id, amount_cents, direction, date")
    .eq("id", transactionId)
    .maybeSingle();
  const applyTo = (String(formData.get("apply_to") ?? "one") || "one") as RecurrenceScope;
  if (!["one", "future", "all"].includes(applyTo)) throw new Error("Escolha em quais lançamentos salvar.");
  const scopes = recurrenceScopes({
    amount: amountCents !== current?.amount_cents,
    direction: direction !== current?.direction,
    description: description !== current?.description,
    category: categoryId !== (current?.category_id ?? null),
  });
  if (applyTo === "all" && !scopes.allowAll) {
    throw new Error("Valor de lançamento que já caiu não muda: escolha \"este e os próximos\".");
  }

  // Lançamento que veio do banco: a impressão digital sai do texto do
  // banco, não do nome. Assim renomear não faz o mesmo extrato, importado
  // de novo, entrar em dobro.
  const bankDescription = (current?.bank_description as string | null) ?? null;
  const fingerprint = computeFingerprint({
    accountId,
    date,
    amountCents,
    description: bankDescription ?? description,
  });
  const recurrenceInput = parseRecurrenceInput(formData);

  const { error } = await supabase
    .from("transactions")
    .update({
      account_id: accountId,
      category_id: categoryId,
      date,
      amount_cents: amountCents,
      direction,
      description,
      notes,
      status: isPending ? "pending" : "cleared",
      fingerprint,
    })
    .eq("id", transactionId)
    .is("transfer_group_id", null);

  if (error) throw new Error(error.message);

  // Renomeou um lançamento do banco: a próxima importação já traz esse
  // nome pro mesmo estabelecimento.
  if (bankDescription && description !== current?.description) {
    await rememberMerchantName(supabase, {
      householdId,
      memberId,
      bankDescription,
      name: description,
    });
  }

  // Trocou a categoria de um lançamento do banco: os outros do mesmo
  // estabelecimento sem categoria vão junto, e a escolha fica lembrada.
  if (bankDescription && categoryId !== (current?.category_id ?? null)) {
    await spreadCategory(supabase, {
      householdId,
      memberId,
      sourceIds: [transactionId],
      categoryId,
    });
  }

  // Faz parte de uma recorrência e a pessoa escolheu levar a mudança
  // pros próximos (ou, só nome e categoria, pra todos).
  if (current?.recurrence_id && applyTo !== "one" && scopes.ask) {
    await applyToRecurrence(supabase, {
      recurrenceId: current.recurrence_id as string,
      transactionId,
      scope: applyTo,
      fromDate: current.date as string,
      newDate: date,
      householdId,
      memberId,
      today,
      changes: { description, categoryId, amountCents, direction: direction as "in" | "out" },
    });
  }

  if (recurrenceInput && !current?.recurrence_id) {
    const recurrenceId = await createRecurrenceFromAnchor({
      householdId,
      memberId,
      template: {
        account_id: accountId,
        category_id: categoryId,
        direction: direction as "in" | "out",
        amount_cents: amountCents,
        description,
        notes,
      },
      frequency: recurrenceInput.frequency,
      anchorDate: date,
      endsOn: recurrenceInput.endsOn,
    });
    const { error: linkError } = await supabase
      .from("transactions")
      .update({ recurrence_id: recurrenceId })
      .eq("id", transactionId);
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/a-pagar");
}

export async function deleteTransferGroup(transferGroupId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("transfer_group_id", transferGroupId);

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
}

/**
 * Pôs categoria em lançamento(s) que vieram do banco: lembra a escolha
 * por estabelecimento e leva a mesma categoria pros outros lançamentos
 * do mesmo estabelecimento (e mesma direção) que estão SEM categoria. O
 * que já tem categoria não muda. Devolve quantos foram junto.
 */
async function spreadCategory(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    memberId: string;
    sourceIds: string[];
    categoryId: string | null;
  },
): Promise<number> {
  const { data: sources } = await supabase
    .from("transactions")
    .select("id, bank_description, direction")
    .in("id", params.sourceIds)
    .not("bank_description", "is", null);
  if (!sources || sources.length === 0) return 0;

  // Uma vez por estabelecimento + direção.
  const targets = new Map<string, { bank: string; direction: "in" | "out" }>();
  for (const s of sources) {
    const bank = s.bank_description as string;
    const direction = s.direction as "in" | "out";
    const key = merchantKey(bank);
    if (key) targets.set(`${direction}|${key}`, { bank, direction });
  }

  for (const t of targets.values()) {
    await rememberMerchantCategory(supabase, {
      householdId: params.householdId,
      memberId: params.memberId,
      bankDescription: t.bank,
      direction: t.direction,
      categoryId: params.categoryId,
    });
  }

  // "Sem categoria" só esquece; não tira a categoria de ninguém.
  if (!params.categoryId || targets.size === 0) return 0;

  const directions = [...new Set([...targets.values()].map((t) => t.direction))];
  // Em páginas: depois de importar um ano, sem categoria passa de 1000.
  const candidates = await fetchAll<{
    id: string;
    bank_description: string;
    direction: "in" | "out";
  }>((from, to) =>
    supabase
      .from("transactions")
      .select("id, bank_description, direction")
      .eq("household_id", params.householdId)
      .is("category_id", null)
      .is("transfer_group_id", null)
      .not("bank_description", "is", null)
      .in("direction", directions)
      .order("id")
      .range(from, to),
  );

  const sourceIds = new Set(params.sourceIds);
  const ids = candidates
    .filter(
      (c) =>
        !sourceIds.has(c.id as string) &&
        targets.has(`${c.direction}|${merchantKey(c.bank_description as string)}`),
    )
    .map((c) => c.id as string);
  if (ids.length === 0) return 0;

  // RLS decide o que dá pra mexer; conta o que de fato mudou. Em lotes,
  // pra lista de ids não estourar o tamanho da requisição.
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data: updated, error: updError } = await supabase
      .from("transactions")
      .update({ category_id: params.categoryId })
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (updError) throw new Error(updError.message);
    changed += updated?.length ?? 0;
  }
  return changed;
}

export async function updateTransactionCategory(
  transactionId: string,
  categoryId: string | null,
): Promise<{ alsoUpdated: number }> {
  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", transactionId);

  if (error) throw new Error(error.message);

  const alsoUpdated = await spreadCategory(supabase, {
    householdId,
    memberId,
    sourceIds: [transactionId],
    categoryId,
  });

  revalidatePath("/transacoes");
  return { alsoUpdated };
}

export async function bulkUpdateCategory(
  transactionIds: string[],
  categoryId: string | null,
): Promise<{ alsoUpdated: number }> {
  if (transactionIds.length === 0) return { alsoUpdated: 0 };

  const { householdId, memberId } = await getCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .in("id", transactionIds);

  if (error) throw new Error(error.message);

  const alsoUpdated = await spreadCategory(supabase, {
    householdId,
    memberId,
    sourceIds: transactionIds,
    categoryId,
  });

  revalidatePath("/transacoes");
  return { alsoUpdated };
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .is("transfer_group_id", null);

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/a-pagar");
}

// Transferência pendente (ex.: a programada de uma meta) confirma os dois
// lados juntos: sair de uma conta sem entrar na outra deixaria o saldo
// das duas errado.
async function withTransferPairs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<{ ids: string[]; groups: string[] }> {
  const { data } = await supabase
    // limite: as linhas que a pessoa marcou
    .from("transactions")
    .select("transfer_group_id")
    .in("id", ids)
    .not("transfer_group_id", "is", null);
  const groups = [...new Set((data ?? []).map((r) => r.transfer_group_id as string))];
  return { ids, groups };
}

export async function markTransactionPaid(transactionId: string) {
  const supabase = await createClient();
  const { groups } = await withTransferPairs(supabase, [transactionId]);
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cleared" })
    .eq("id", transactionId);

  if (error) throw new Error(error.message);
  if (groups.length > 0) {
    const { error: pairError } = await supabase
      .from("transactions")
      .update({ status: "cleared" })
      .in("transfer_group_id", groups)
      .eq("status", "pending");
    if (pairError) throw new Error(pairError.message);
  }

  revalidatePath("/a-pagar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
  revalidatePath("/metas");
}

export async function bulkMarkPaid(transactionIds: string[]) {
  if (transactionIds.length === 0) return;

  const supabase = await createClient();
  const { groups } = await withTransferPairs(supabase, transactionIds);
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cleared" })
    .in("id", transactionIds);

  if (error) throw new Error(error.message);
  if (groups.length > 0) {
    const { error: pairError } = await supabase
      .from("transactions")
      .update({ status: "cleared" })
      .in("transfer_group_id", groups)
      .eq("status", "pending");
    if (pairError) throw new Error(pairError.message);
  }

  revalidatePath("/a-pagar");
  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
}

export async function createTransfer(formData: FormData) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const fromAccountId = String(formData.get("from_account_id") ?? "");
  const toAccountId = String(formData.get("to_account_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const description =
    String(formData.get("description") ?? "").trim() || "Transferência";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const amountInput = String(formData.get("amount") ?? "");

  if (!fromAccountId || !toAccountId)
    throw new Error("Selecione as duas contas.");
  if (fromAccountId === toAccountId) {
    throw new Error("Conta de origem e destino não podem ser a mesma.");
  }
  if (!date) throw new Error("Data é obrigatória.");

  const amountCents = parseToCents(amountInput);
  if (amountCents <= 0) throw new Error("Valor precisa ser maior que zero.");

  const fromFingerprint = computeFingerprint({
    accountId: fromAccountId,
    date,
    amountCents,
    description,
  });
  const toFingerprint = computeFingerprint({
    accountId: toAccountId,
    date,
    amountCents,
    description,
  });

  const { error } = await supabase.rpc("create_transfer", {
    p_household_id: householdId,
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_date: date,
    p_amount_cents: amountCents,
    p_description: description,
    p_notes: notes,
    p_created_by: memberId,
    p_from_fingerprint: fromFingerprint,
    p_to_fingerprint: toFingerprint,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  revalidatePath("/mes");
}

/**
 * Leva a edição de um lançamento pra recorrência dele.
 * - "future": o modelo passa a ter o novo nome, valor, tipo e categoria, e
 *   as previsões depois deste são refeitas com ele.
 * - "all": só nome e categoria, em todos os lançamentos da recorrência
 *   (inclusive os que já caíram) e no modelo.
 * O que já caiu nunca muda de valor.
 */
async function applyToRecurrence(
  supabase: SupabaseClient,
  p: {
    recurrenceId: string;
    transactionId: string;
    scope: "future" | "all";
    fromDate: string;
    newDate: string;
    householdId: string;
    memberId: string;
    today: string;
    changes: { description: string; categoryId: string | null; amountCents: number; direction: "in" | "out" };
  },
) {
  const { data: rec } = await supabase.from("recurrences").select("template").eq("id", p.recurrenceId).maybeSingle();
  if (!rec) throw new Error("Recorrência não encontrada.");
  const current = rec.template as RecurrenceTemplate;
  const template: RecurrenceTemplate =
    p.scope === "future"
      ? {
          ...current,
          description: p.changes.description,
          category_id: p.changes.categoryId,
          amount_cents: p.changes.amountCents,
          direction: p.changes.direction,
        }
      : { ...current, description: p.changes.description, category_id: p.changes.categoryId };
  const { data: updated, error } = await supabase
    .from("recurrences")
    .update({ template })
    .eq("id", p.recurrenceId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error("Você não pode editar essa recorrência.");

  if (p.scope === "all") {
    // Nome e categoria em todos os que já existem (os do banco guardam o
    // texto original em bank_description, então a impressão digital não muda).
    const { error: allError } = await supabase
      .from("transactions")
      .update({ description: p.changes.description, category_id: p.changes.categoryId })
      .eq("recurrence_id", p.recurrenceId)
      .neq("id", p.transactionId);
    if (allError) throw new Error(allError.message);
    // As previsões de hoje em diante são refeitas com o modelo novo; os já
    // confirmados à mão têm a impressão digital pelo nome: refaz um a um
    // (são poucos: o que veio do banco usa o texto do banco).
    await replaceFutureOccurrences({
      recurrenceId: p.recurrenceId,
      householdId: p.householdId,
      memberId: p.memberId,
      from: p.today,
      keep: { id: p.transactionId, date: p.newDate },
    });
    const manual = await fetchAll<{ id: string; account_id: string; date: string; amount_cents: number }>((from, to) =>
      supabase
        .from("transactions")
        .select("id, account_id, date, amount_cents")
        .eq("recurrence_id", p.recurrenceId)
        .eq("status", "cleared")
        .is("bank_description", null)
        .neq("id", p.transactionId)
        .order("id")
        .range(from, to),
    );
    for (const t of manual) {
      await supabase
        .from("transactions")
        .update({
          fingerprint: computeFingerprint({
            accountId: t.account_id,
            date: t.date,
            amountCents: t.amount_cents,
            description: p.changes.description,
          }),
        })
        .eq("id", t.id);
    }
    return;
  }

  // "future": previsões atrasadas entre este e hoje mudam ali mesmo (não
  // dá pra refazer o passado pelo calendário: algumas já caíram); de hoje
  // em diante, as previsões são refeitas com o modelo novo.
  const next = new Date(`${p.fromDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const after = next.toISOString().slice(0, 10);
  if (after < p.today) {
    const { error: lateError } = await supabase
      .from("transactions")
      .update({
        description: p.changes.description,
        category_id: p.changes.categoryId,
        amount_cents: p.changes.amountCents,
        direction: p.changes.direction,
      })
      .eq("recurrence_id", p.recurrenceId)
      .eq("status", "pending")
      .gte("date", after)
      .lt("date", p.today)
      .neq("id", p.transactionId);
    if (lateError) throw new Error(lateError.message);
  }
  await replaceFutureOccurrences({
    recurrenceId: p.recurrenceId,
    householdId: p.householdId,
    memberId: p.memberId,
    from: after > p.today ? after : p.today,
    keep: { id: p.transactionId, date: p.newDate },
  });
}
