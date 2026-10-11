import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Camada de escopo da privacidade seletiva por conta.
//
// O RLS (migration 0010) garante o piso: conta `hidden` de outro membro não
// chega ao cliente, ponto. Mas RLS é binário — a linha passa ou não passa — e
// os níveis `balance_only` e `categories_only` precisam que a MESMA linha
// seja parcialmente visível: contar pro saldo sem aparecer no extrato. Isso
// não é expressável em policy, então mora aqui.
//
// Regra geral do produto: um total nunca é silenciosamente parcial. Por isso
// o escopo devolve `excludedCount` junto com os ids — somar sem saber quantas
// contas ficaram de fora exigiria ignorar um campo que está bem ali.

export type AccountVisibility =
  | "hidden"
  | "balance_only"
  | "categories_only"
  | "shared";

// Cada agregação exige um nível mínimo de exposição.
//
//   balance          saldo total, fluxo de caixa
//   monthly_totals   Entrou/Saiu do mês, Previsto x Realizado
//   categories       donut de despesas, relatórios
//   transactions     extrato, A vencer, recorrências
export type AggregationKind =
  | "balance"
  | "monthly_totals"
  | "categories"
  | "transactions";

const MINIMUM_LEVEL: Record<AggregationKind, AccountVisibility> = {
  balance: "balance_only",
  monthly_totals: "categories_only",
  categories: "categories_only",
  transactions: "shared",
};

// Ordem crescente de exposição — igual à do enum no banco. Os níveis são
// cumulativos, então "entra nesta agregação?" é uma comparação de posição.
const LEVEL_ORDER: AccountVisibility[] = [
  "hidden",
  "balance_only",
  "categories_only",
  "shared",
];

function atLeast(level: AccountVisibility, minimum: AccountVisibility) {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minimum);
}

export type AccountScope = {
  /** Ids das contas que entram nesta agregação. */
  ids: string[];
  /**
   * Quantas contas o leitor SABE que existem mas ficaram fora desta soma.
   * Alimenta o rótulo "N conta pessoal fora deste total".
   *
   * Contas `hidden` não entram nesta contagem: dizer "existe 1 conta que
   * você não pode ver" anularia exatamente o que esse nível promete. Elas
   * também não deixam o caixa comum desbalanceado — o que sai da conta
   * conjunta pra uma conta pessoal é uma transferência, e aparece como tal.
   */
  excludedCount: number;
};

type AccountRow = {
  id: string;
  owner_id: string | null;
  visibility: AccountVisibility;
};

// Uma ida ao banco por request, compartilhada por todas as telas. `cache` do
// React dedupa dentro do mesmo render — é o padrão de Data Access Layer que
// os docs do Next recomendam pra evitar passar o escopo de componente em
// componente.
const fetchAccounts = cache(
  async (supabase: SupabaseClient, householdId: string): Promise<AccountRow[]> => {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, owner_id, visibility")
      .eq("household_id", householdId);

    if (error) throw new Error(error.message);
    return (data ?? []) as AccountRow[];
  },
);

/**
 * Resolve quais contas entram em uma agregação para um leitor específico.
 *
 * O dono sempre vê a própria conta inteira, em qualquer nível: `visibility`
 * governa só o que os OUTROS membros enxergam.
 */
export async function accountScope(
  supabase: SupabaseClient,
  householdId: string,
  viewerId: string,
  kind: AggregationKind,
): Promise<AccountScope> {
  const accounts = await fetchAccounts(supabase, householdId);
  const minimum = MINIMUM_LEVEL[kind];

  const ids: string[] = [];
  let excludedCount = 0;

  for (const account of accounts) {
    const isJoint = account.owner_id === null;
    const isMine = account.owner_id === viewerId;

    if (isJoint || isMine) {
      ids.push(account.id);
      continue;
    }

    if (atLeast(account.visibility, minimum)) {
      ids.push(account.id);
    } else if (account.visibility !== "hidden") {
      excludedCount += 1;
    }
  }

  return { ids, excludedCount };
}

/**
 * Rótulo curto pro card quando a soma é parcial, ou null quando é completa.
 * Nomeia a quantidade, nunca a conta nem o valor.
 */
export function scopeLabel(scope: AccountScope): string | null {
  if (scope.excludedCount === 0) return null;
  return scope.excludedCount === 1
    ? "1 conta pessoal fora deste total"
    : `${scope.excludedCount} contas pessoais fora deste total`;
}
