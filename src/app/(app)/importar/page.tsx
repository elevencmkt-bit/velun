import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { fetchConfirmedCandidates } from "@/lib/import/confirmed-candidates";
import { possibleDoubles } from "@/lib/import/match-confirmed";
import { ImportWorkspace } from "./import-workspace";

export default async function ImportarPage() {
  const { householdId, memberId, currency } = await getCurrentMember();
  const supabase = await createClient();

  // Só dá pra importar extrato pra conta do casal ou conta minha: o banco
  // recusa importação e lançamento na conta pessoal do outro, mesmo
  // quando ela é "aberta" (dá pra ver, não dá pra mexer). A tela não deve
  // oferecer o que vai falhar.

  const [
    { data: accounts },
    { data: categories },
    { data: pending },
    { data: history },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, owner_id, type, institution")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .or(`owner_id.is.null,owner_id.eq.${memberId}`)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("imports")
      .select(
        "id, account_id, file_path, statement_start, statement_end, balance_matches, extracted_sum_cents",
      )
      .eq("household_id", householdId)
      .eq("status", "review")
      .order("created_at", { ascending: false })
      .limit(1),
    // Importações já confirmadas, pra poder desfazer. Sem isso, um
    // extrato importado na conta errada só sai apagando lançamento por
    // lançamento na mão.
    supabase
      .from("imports")
      .select(
        "id, file_path, statement_start, statement_end, created_at, account:accounts(name, type, institution)",
      )
      .eq("household_id", householdId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const openImport = pending?.[0] ?? null;

  // Quantos lançamentos cada importação criou: é o número que o desfazer
  // precisa mostrar antes de apagar nada.
  const historyIds = (history ?? []).map((h) => h.id as string);
  const { data: importedRows } =
    historyIds.length > 0
      ? await supabase
          .from("transactions")
          .select("import_id")
          .eq("household_id", householdId)
          .in("import_id", historyIds)
      : { data: null };

  const countByImport = new Map<string, number>();
  for (const row of importedRows ?? []) {
    const id = row.import_id as string;
    countByImport.set(id, (countByImport.get(id) ?? 0) + 1);
  }

  const { data: staged } = openImport
    ? await supabase
        .from("staged_transactions")
        .select(
          "id, date, description, bank_description, amount_cents, direction, suggested_category_id, category_source, dup_status, is_included, merge_accepted, fingerprint, match:transactions!staged_transactions_match_transaction_id_fkey(id, date, description, status), card_payment_accepted, card:accounts!staged_transactions_card_payment_account_id_fkey(name)",
        )
        .eq("import_id", openImport.id)
        .order("date")
    : { data: null };

  // Previsões do período que o extrato não confirmou. Sem isso elas
  // ficam somando no mês ao lado do dinheiro de verdade, e é o caso do
  // pagamento que saiu em duas transferências ou com valor diferente do
  // previsto — o cruzamento automático não junta esses de propósito.
  const matchedIds = new Set(
    (staged ?? [])
      .map((s) => {
        const m = s.match as { id: string } | { id: string }[] | null;
        return Array.isArray(m) ? m[0]?.id : m?.id;
      })
      .filter((id): id is string => Boolean(id)),
  );

  const { data: forecasts } = openImport
    ? await supabase
        .from("transactions")
        .select("id, date, description, amount_cents, direction")
        .eq("household_id", householdId)
        .eq("account_id", openImport.account_id as string)
        .eq("status", "pending")
        .not("recurrence_id", "is", null)
        .gte("date", openImport.statement_start as string)
        .lte("date", openImport.statement_end as string)
        .order("date")
    : { data: null };

  // Lançamentos confirmados à mão que dividem valor com alguma linha do
  // extrato mas não viraram par único — o valor se repete, ou as datas
  // estão longe. Não dá pra apontar qual linha é qual, então é só aviso.
  const doubles = openImport
    ? possibleDoubles(
        (staged ?? []).map((s) => ({
          date: s.date as string,
          amountCents: s.amount_cents as number,
          direction: s.direction as "in" | "out",
          fingerprint: s.fingerprint as string,
          free: true,
        })),
        await fetchConfirmedCandidates(
          supabase,
          householdId,
          openImport.account_id as string,
          {
            periodStart: openImport.statement_start as string,
            periodEnd: openImport.statement_end as string,
          },
        ),
        matchedIds,
      )
    : [];

  return (
    <ImportWorkspace
      accounts={(accounts ?? []).map((a) => ({
        id: a.id as string,
        name: a.name as string,
        isPersonal: a.owner_id !== null,
        type: a.type as string,
        institution: (a.institution as string | null) ?? null,
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
              balanceMatches: (openImport.balance_matches as boolean | null) ?? null,
            }
          : null
      }
      rows={(staged ?? []).map((s) => {
        const m = s.match as
          | { id: string; date: string; description: string; status: string }
          | { id: string; date: string; description: string; status: string }[]
          | null;
        const match = Array.isArray(m) ? (m[0] ?? null) : m;

        return {
          id: s.id as string,
          date: s.date as string,
          description: s.description as string,
          bankDescription: (s.bank_description as string | null) ?? null,
          amountCents: s.amount_cents as number,
          direction: s.direction as "in" | "out",
          categoryId: (s.suggested_category_id as string | null) ?? null,
          categorySource: s.category_source as "manual" | "model" | "rule" | "none",
          isDuplicate: s.dup_status !== "none",
          cardPayment: (() => {
            const card = (Array.isArray(s.card) ? s.card[0] : s.card) as {
              name: string;
            } | null;
            return card
              ? {
                  cardName: card.name,
                  accepted: s.card_payment_accepted as boolean,
                }
              : null;
          })(),
          isIncluded: s.is_included as boolean,
          match: match
            ? {
                description: match.description,
                date: match.date,
                accepted: s.merge_accepted as boolean,
                // Previsão (pendente) ou lançamento já confirmado: muda a
                // frase e o padrão — previsão vem marcada pra juntar,
                // confirmado vem desmarcado.
                kind:
                  match.status === "pending"
                    ? ("forecast" as const)
                    : ("confirmed" as const),
              }
            : null,
        };
      })}
      doubles={doubles.map((d) => ({
        id: d.candidate.id,
        date: d.candidate.date,
        description: d.candidate.description,
        amountCents: d.candidate.amountCents,
        direction: d.candidate.direction,
        statementDates: d.statementDates,
      }))}
      forecasts={(forecasts ?? [])
        .filter((f) => !matchedIds.has(f.id as string))
        .map((f) => ({
          id: f.id as string,
          date: f.date as string,
          description: f.description as string,
          amountCents: f.amount_cents as number,
          direction: f.direction as "in" | "out",
        }))}
      history={(history ?? []).map((h) => {
        type Acc = { name: string; type: string; institution: string | null };
        const raw = h.account as Acc | Acc[] | null;
        const account = Array.isArray(raw) ? (raw[0] ?? null) : raw;
        return {
          id: h.id as string,
          fileName: h.file_path as string,
          accountName: account?.name ?? "—",
          accountType: account?.type ?? "checking",
          accountInstitution: account?.institution ?? null,
          periodStart: h.statement_start as string,
          periodEnd: h.statement_end as string,
          transactionCount: countByImport.get(h.id as string) ?? 0,
        };
      })}
      currency={currency}
    />
  );
}
