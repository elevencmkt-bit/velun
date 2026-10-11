import type { SupabaseClient } from "@supabase/supabase-js";

// Notificações de mudança de visibilidade de conta.
//
// Regra 2 do princípio da privacidade seletiva: o dono pode mudar o nível
// de uma conta a qualquer momento, mas nunca em silêncio. O log é escrito
// por trigger no banco (migration 0011); aqui só se lê.

export type VisibilityNotification = {
  id: string;
  accountName: string;
  changedByName: string;
  fromLabel: string;
  toLabel: string;
  createdAt: string;
  isNew: boolean;
};

// Descrito pelo que o outro membro passa a ver — mesma linguagem do
// formulário de conta, pra que a notificação e a escolha falem igual.
const LEVEL_LABELS: Record<string, string> = {
  hidden: "nada visível",
  balance_only: "só o saldo",
  categories_only: "saldo e categorias",
  shared: "tudo visível",
};

function levelLabel(visibility: string, ownerId: string | null) {
  // Conta do casal não tem nível: é aberta por definição.
  if (ownerId === null) return "conta do casal";
  return LEVEL_LABELS[visibility] ?? visibility;
}

export async function fetchVisibilityNotifications(
  supabase: SupabaseClient,
  householdId: string,
  viewerId: string,
  seenAt: string | null,
): Promise<VisibilityNotification[]> {
  const { data, error } = await supabase
    .from("account_visibility_changes")
    .select(
      `id, created_at, from_visibility, to_visibility, from_owner_id, to_owner_id,
       account:accounts(name),
       author:members!account_visibility_changes_changed_by_fkey(display_name)`,
    )
    .eq("household_id", householdId)
    // A própria pessoa não precisa ser avisada do que ela mesma fez.
    .neq("changed_by", viewerId)
    .order("created_at", { ascending: false })
    .limit(20);

  // O sino é secundário: se a consulta falhar, a tela não deve cair junto.
  if (error) return [];

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    accountName: single<{ name: string }>(row.account)?.name ?? "uma conta",
    changedByName:
      single<{ display_name: string }>(row.author)?.display_name ?? "um membro",
    fromLabel: levelLabel(row.from_visibility as string, row.from_owner_id as string | null),
    toLabel: levelLabel(row.to_visibility as string, row.to_owner_id as string | null),
    createdAt: row.created_at as string,
    isNew: seenAt === null || (row.created_at as string) > seenAt,
  }));
}
