import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { ImportWorkspace } from "./import-workspace";

export default async function ImportarPage() {
  const { householdId, memberId, currency } = await getCurrentMember();
  const supabase = await createClient();

  // Só dá pra importar extrato pra conta do casal ou conta minha: o
  // `with check` do RLS recusa lançamento na conta pessoal do outro, e a
  // tela não deve oferecer o que vai falhar.
  const scope = await accountScope(supabase, householdId, memberId, "transactions");

  const [{ data: accounts }, { data: categories }, { data: pending }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, owner_id")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .in("id", scope.ids.length > 0 ? scope.ids : ["00000000-0000-0000-0000-000000000000"])
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("imports")
      .select("id, file_path, statement_start, statement_end, balance_matches, extracted_sum_cents")
      .eq("household_id", householdId)
      .eq("status", "review")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const openImport = pending?.[0] ?? null;

  const { data: staged } = openImport
    ? await supabase
        .from("staged_transactions")
        .select(
          "id, date, description, amount_cents, direction, suggested_category_id, dup_status, is_included",
        )
        .eq("import_id", openImport.id)
        .order("date")
    : { data: null };

  return (
    <ImportWorkspace
      accounts={(accounts ?? []).map((a) => ({
        id: a.id as string,
        name: a.name as string,
        isPersonal: a.owner_id !== null,
      }))}
      categories={(categories ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        kind: c.kind as string,
      }))}
      openImport={
        openImport
          ? {
              id: openImport.id as string,
              fileName: openImport.file_path as string,
              periodStart: openImport.statement_start as string,
              periodEnd: openImport.statement_end as string,
              balanceMatches: openImport.balance_matches as boolean,
            }
          : null
      }
      rows={(staged ?? []).map((s) => ({
        id: s.id as string,
        date: s.date as string,
        description: s.description as string,
        amountCents: s.amount_cents as number,
        direction: s.direction as "in" | "out",
        categoryId: (s.suggested_category_id as string | null) ?? null,
        isDuplicate: s.dup_status !== "none",
        isIncluded: s.is_included as boolean,
      }))}
      currency={currency}
    />
  );
}
