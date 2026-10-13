import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { getCashFlowProjection } from "@/lib/cash-flow";
import { cardBills, loadCards } from "@/lib/cards";
import { CardStack } from "@/components/card-stack";
import { addDaysISO } from "@/lib/today";
import type { CurrencyCode } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { RecurrenceForm } from "./recurrence-form";
import { RecurrencesList, type RecurrenceRow } from "./recurrences-list";
import { UpcomingGroups, type Group, type PendingRow } from "./upcoming-groups";

const HORIZON_DAYS = 30;

type View = "tudo" | "pagar" | "receber" | "recorrencias";
const TABS: { key: View; label: string }[] = [
  { key: "tudo", label: "Tudo" },
  { key: "pagar", label: "A pagar" },
  { key: "receber", label: "A receber" },
  { key: "recorrencias", label: "Recorrências" },
];

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    .replace(" de ", " ")
    .replace(".", "");
}

function Signed({
  cents,
  currency,
}: {
  cents: number;
  currency: CurrencyCode;
}) {
  return (
    <>
      {cents < 0 ? "−" : ""}
      <Money cents={Math.abs(cents)} currency={currency} />
    </>
  );
}

// Quanto uma recorrência pesa por mês, pra somar semanal, mensal e anual
// numa conta só.
const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

export default async function AVencerPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();
  const { ver } = await searchParams;
  const view: View = TABS.some((t) => t.key === ver) ? (ver as View) : "tudo";

  // A vencer é extrato futuro: mesmo nível do extrato. De conta pessoal
  // do outro, só entra a marcada como "aberta". O saldo segue o nível de
  // saldo, como no Dashboard.
  const [scope, balanceScope] = await Promise.all([
    accountScope(supabase, householdId, memberId, "transactions"),
    accountScope(supabase, householdId, memberId, "balance"),
  ]);
  const visibleIds =
    scope.ids.length > 0 ? scope.ids : ["00000000-0000-0000-0000-000000000000"];
  const visibleSet = new Set(scope.ids);

  const weekEnd = addDaysISO(today, 6);
  const horizon = addDaysISO(today, HORIZON_DAYS);

  const [
    { data: accounts },
    { data: categories },
    { data: pendingRaw },
    { data: recurrencesRaw },
    cashFlow,
    cards,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, owner_id, is_archived")
      .eq("household_id", householdId)
      .in("id", visibleIds)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind, is_transfer")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
    supabase
      // limite: pendentes até o horizonte da tela (semanas), poucas dezenas
      .from("transactions")
      .select(
        `id, date, description, amount_cents, direction, account_id, recurrence_id, transfer_group_id,
           account:accounts(name),
           category:categories(name)`,
      )
      .eq("household_id", householdId)
      .eq("status", "pending")
      .in("account_id", visibleIds)
      .lte("date", horizon)
      .order("date", { ascending: true }),
    supabase
      // limite: recorrências ativas da casa, poucas dezenas
      .from("recurrences")
      .select("id, template, frequency, day_of_month")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    getCashFlowProjection(
      supabase,
      householdId,
      HORIZON_DAYS,
      balanceScope,
      today,
    ),
    loadCards(supabase, householdId, memberId, today),
  ]);

  // Faturas que esta pessoa paga ou pode ver por inteiro (do cartão
  // pessoal do outro, só se ele estiver aberto).
  const myCards = cards.filter((c) => c.canEdit || c.canSeeTransactions);
  const cardIds = new Set(cards.map((c) => c.id));
  const bills = cardBills(myCards);
  // Cartão da lateral: o da próxima fatura a vencer.
  const nextBill = bills.find((b) => b.amountCents > 0) ?? null;
  const tileCard =
    myCards.find((c) => c.id === nextBill?.cardId) ?? myCards[0] ?? null;

  // Onde quem está vendo pode mexer: conta do casal e as próprias.
  const mine = (accounts ?? []).filter(
    (a) => a.owner_id === null || a.owner_id === memberId,
  );
  const writableIds = new Set(mine.map((a) => a.id as string));
  const writable = mine.filter((a) => !a.is_archived);
  const accountNames = new Map(
    (accounts ?? []).map((a) => [a.id as string, a.name as string]),
  );
  const moveTargets = writable.map((a) => ({
    id: a.id as string,
    name: a.name as string,
  }));

  const single = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  // Compra prevista no cartão não aparece sozinha: ela já está dentro da
  // fatura, que entra aqui como uma linha só.
  const allPending: PendingRow[] = [
    ...(pendingRaw ?? [])
      .filter(
        (row) =>
          !row.transfer_group_id && !cardIds.has(row.account_id as string),
      )
      .map((row) => ({
        id: row.id as string,
        date: row.date as string,
        description: row.description as string,
        amount_cents: row.amount_cents as number,
        direction: row.direction as "in" | "out",
        account_name: single<{ name: string }>(row.account)?.name ?? "—",
        category_name: single<{ name: string }>(row.category)?.name ?? null,
        recurring: row.recurrence_id !== null,
        can_edit: writableIds.has(row.account_id as string),
      })),
    ...bills
      .filter((b) => b.date <= horizon)
      .map((b): PendingRow => ({
        id: `fatura:${b.id}`,
        date: b.date,
        description: `Fatura · ${b.cardName}`,
        amount_cents: b.amountCents,
        direction: "out",
        account_name:
          b.status === "open"
            ? `Aberta, fecha ${shortDate(b.closing)}`
            : "Fechada",
        category_name: null,
        recurring: false,
        can_edit: false,
        bill: {
          href: `/cartoes?cartao=${b.cardId}&fatura=${b.closing}`,
          color: b.color,
        },
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const totalOut = allPending
    .filter((r) => r.direction === "out")
    .reduce((s, r) => s + r.amount_cents, 0);
  const totalIn = allPending
    .filter((r) => r.direction === "in")
    .reduce((s, r) => s + r.amount_cents, 0);
  const overdueCount = allPending.filter((r) => r.date < today).length;

  const shown = allPending.filter((r) =>
    view === "pagar"
      ? r.direction === "out"
      : view === "receber"
        ? r.direction === "in"
        : true,
  );
  const groups: Group[] = [
    {
      key: "overdue",
      title: "Atrasadas",
      subtitle:
        "Já pagou? Marque aqui, ou importe o extrato que o Velun quita sozinho.",
      rows: shown.filter((r) => r.date < today),
    },
    {
      key: "week",
      title: "Esta semana",
      rows: shown.filter((r) => r.date >= today && r.date <= weekEnd),
    },
    {
      key: "later",
      title: "Mais adiante",
      rows: shown.filter((r) => r.date > weekEnd),
    },
  ];

  // Faixa dos próximos 30 dias: uma barrinha por dia, do tamanho do que
  // sai ou entra naquele dia. Mostra num relance onde o mês aperta.
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) =>
    addDaysISO(today, i),
  );
  const perDay = new Map<string, { out: number; in: number }>();
  for (const r of allPending) {
    if (r.date < today) continue;
    const entry = perDay.get(r.date) ?? { out: 0, in: 0 };
    if (r.direction === "out") entry.out += r.amount_cents;
    else entry.in += r.amount_cents;
    perDay.set(r.date, entry);
  }
  const dayMax = Math.max(
    1,
    ...Array.from(perDay.values()).flatMap((d) => [d.out, d.in]),
  );

  // Recorrências: a conta mora no `template` (jsonb), então o filtro de
  // visibilidade é feito aqui e não na consulta.
  const recurrenceRows: RecurrenceRow[] = (recurrencesRaw ?? [])
    .filter((row) =>
      visibleSet.has((row.template as { account_id: string }).account_id),
    )
    .map((row) => {
      const template = row.template as {
        account_id: string;
        direction: "in" | "out";
        amount_cents: number;
        description: string;
      };
      return {
        id: row.id,
        description: template.description,
        amount_cents: template.amount_cents,
        direction: template.direction,
        frequency: row.frequency,
        day_of_month: row.day_of_month,
        account_id: template.account_id,
        account_name: accountNames.get(template.account_id) ?? "—",
        can_edit: writableIds.has(template.account_id),
      };
    });
  const recurrencesIn = recurrenceRows.filter((r) => r.direction === "in");
  const recurrencesOut = recurrenceRows.filter((r) => r.direction === "out");
  const monthlyOf = (rows: RecurrenceRow[]) =>
    Math.round(
      rows.reduce(
        (s, r) => s + r.amount_cents * (PER_MONTH[r.frequency] ?? 1),
        0,
      ),
    );

  const lowest = cashFlow.lowestPoint;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-page-title">A vencer</h1>
          <p className="text-page-subtitle">
            O que sai e o que entra nos próximos {HORIZON_DAYS} dias.
          </p>
        </div>
        <nav
          aria-label="Filtro"
          className="flex max-w-full gap-0.5 overflow-x-auto rounded-[14px] bg-(--bg-surface) p-1 [scrollbar-width:none] max-lg:self-start sm:gap-1"
        >
          {TABS.map((tab) => {
            const active = tab.key === view;
            return (
              <Link
                key={tab.key}
                href={
                  tab.key === "tudo" ? "/a-pagar" : `/a-pagar?ver=${tab.key}`
                }
                aria-current={active ? "page" : undefined}
                className={`flex h-9 shrink-0 items-center rounded-[11px] px-3 text-[13px] font-semibold transition-colors sm:px-4 sm:text-[14px] ${
                  active
                    ? "bg-(--bg-inverse) text-white"
                    : "text-(--text-muted) hover:text-(--text-primary)"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {view === "recorrencias" ? (
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-(--text-muted)">
              O que se repete sozinho. Cada um vira previsão em A vencer.
            </p>
            <RecurrenceForm
              accounts={writable.map((a) => ({
                id: a.id as string,
                name: a.name as string,
              }))}
              categories={categories ?? []}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-card-title">
                  Entradas recorrentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecurrencesList
                  accounts={moveTargets}
                  rows={recurrencesIn}
                  currency={currency}
                  emptyMessage="Nenhuma entrada recorrente cadastrada."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-card-title">
                  Saídas recorrentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecurrencesList
                  accounts={moveTargets}
                  rows={recurrencesOut}
                  currency={currency}
                  emptyMessage="Nenhuma saída recorrente cadastrada."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <section
            className="rounded-[20px] bg-(--bg-surface) p-5 md:p-7"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <div>
                <div className="text-[13px] font-medium text-(--text-muted)">
                  Vai sair
                </div>
                <div className="mt-1 text-[21px] font-bold tabular-nums text-(--expense-dark) md:text-[26px]">
                  −<Money cents={totalOut} currency={currency} />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-(--text-muted)">
                  Vai entrar
                </div>
                <div className="mt-1 text-[21px] font-bold tabular-nums text-(--income-dark) md:text-[26px]">
                  +<Money cents={totalIn} currency={currency} />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-(--text-muted)">
                  Saldo hoje
                </div>
                <div className="mt-1 text-[21px] font-bold tabular-nums md:text-[26px]">
                  <Signed cents={cashFlow.currentTotal} currency={currency} />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-(--text-muted)">
                  Saldo em {shortDate(cashFlow.finalPoint.date)}
                </div>
                <div className="mt-1 text-[21px] font-bold tabular-nums md:text-[26px]">
                  <Signed
                    cents={cashFlow.finalPoint.balance_cents}
                    currency={currency}
                  />
                </div>
                {overdueCount > 0 ? (
                  <div className="text-[11px] text-(--text-light)">
                    sem contar as atrasadas
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 md:mt-7">
              <div
                className="grid h-20 items-end gap-[3px] md:h-24 md:gap-1"
                style={{
                  gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(0, 1fr))`,
                }}
              >
                {days.map((date) => {
                  const d = perDay.get(date);
                  const out = d?.out ?? 0;
                  const inc = d?.in ?? 0;
                  // Só a data no balão: o valor apareceria mesmo com
                  // "ocultar valores" ligado.
                  const title = shortDate(date);
                  return (
                    <div
                      key={date}
                      className="flex h-full items-end gap-px"
                      title={title}
                    >
                      {out === 0 && inc === 0 ? (
                        <div className="h-2 w-full rounded-[5px] bg-(--bg-subtle)" />
                      ) : (
                        <>
                          {out > 0 ? (
                            <div
                              className="w-full rounded-[5px]"
                              style={{
                                height: `${Math.max(12, (out / dayMax) * 100)}%`,
                                background: "var(--expense)",
                              }}
                            />
                          ) : null}
                          {inc > 0 ? (
                            <div
                              className="w-full rounded-[5px]"
                              style={{
                                height: `${Math.max(12, (inc / dayMax) * 100)}%`,
                                background: "var(--income)",
                              }}
                            />
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex justify-between text-[12px] text-(--text-light)">
                <span className="font-semibold text-(--text-primary)">
                  Hoje, {shortDate(days[0])}
                </span>
                <span className="max-sm:hidden">{shortDate(days[7])}</span>
                <span className="max-sm:hidden">{shortDate(days[14])}</span>
                <span>{shortDate(days[21])}</span>
                <span>{shortDate(days[HORIZON_DAYS - 1])}</span>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              <UpcomingGroups groups={groups} currency={currency} />
            </div>

            <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:col-span-4">
              {tileCard ? (
                <CardStack
                  title={nextBill ? "Próxima fatura" : "Cartões"}
                  currency={currency}
                  cards={[
                    tileCard,
                    ...myCards.filter((c) => c.id !== tileCard.id),
                  ].map((c) => {
                    const bill = bills.find(
                      (b) => b.cardId === c.id && b.amountCents > 0,
                    );
                    const statusLabel =
                      bill?.status === "open"
                        ? "Aberta"
                        : bill?.status === "overdue"
                          ? "Vencida"
                          : "Fechada";
                    return {
                      id: c.id,
                      name: c.name,
                      lastFour: c.lastFour,
                      color: c.color,
                      caption: bill
                        ? `${statusLabel} · vence ${shortDate(bill.date)}`
                        : `Fatura aberta · vence ${shortDate(c.current.due)}`,
                      amountCents: bill
                        ? bill.amountCents
                        : c.current.totalCents,
                      usedPct: c.limitCents
                        ? Math.min(100, (c.debtCents / c.limitCents) * 100)
                        : null,
                      footerLeft: c.limitCents
                        ? `${Math.round((c.debtCents / c.limitCents) * 100)}% do limite`
                        : `Fecha ${shortDate(c.current.closing)}`,
                      freeCents: c.limitCents
                        ? c.limitCents - c.debtCents
                        : null,
                    };
                  })}
                />
              ) : null}
              <section
                className="rounded-[20px] bg-(--bg-surface) p-5 md:p-6"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <h2 className="text-card-title">Recorrências</h2>
                <p className="mt-1 mb-4 text-[13px] text-(--text-muted)">
                  O que se repete sozinho.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-[14px] bg-(--income-soft) p-3.5">
                    <div className="text-xs font-semibold text-(--income-dark)">
                      {recurrencesIn.length}{" "}
                      {recurrencesIn.length === 1 ? "entrada" : "entradas"}
                    </div>
                    <div className="mt-1 text-[17px] font-bold tabular-nums text-(--income-dark)">
                      <Money
                        cents={monthlyOf(recurrencesIn)}
                        currency={currency}
                      />
                      <span className="text-[12px] font-semibold">/mês</span>
                    </div>
                  </div>
                  <div className="flex-1 rounded-[14px] bg-(--expense-soft) p-3.5">
                    <div className="text-xs font-semibold text-(--expense-dark)">
                      {recurrencesOut.length}{" "}
                      {recurrencesOut.length === 1 ? "saída" : "saídas"}
                    </div>
                    <div className="mt-1 text-[17px] font-bold tabular-nums text-(--expense-dark)">
                      <Money
                        cents={monthlyOf(recurrencesOut)}
                        currency={currency}
                      />
                      <span className="text-[12px] font-semibold">/mês</span>
                    </div>
                  </div>
                </div>
                <Link
                  href="/a-pagar?ver=recorrencias"
                  className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-(--primary) hover:text-(--primary-hover)"
                >
                  Gerenciar recorrências <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>

              {lowest.balance_cents < 0 ? (
                <section className="rounded-[20px] bg-(--primary-soft) p-5 md:p-6">
                  <div className="text-[14px] font-bold text-(--primary-hover)">
                    {lowest.date === today
                      ? "Saldo negativo hoje"
                      : `Atenção a ${shortDate(lowest.date)}`}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-(--text-secondary)">
                    O saldo mais baixo dos próximos {HORIZON_DAYS} dias é{" "}
                    <Signed cents={lowest.balance_cents} currency={currency} />
                    {lowest.date === today
                      ? ", hoje"
                      : `, em ${shortDate(lowest.date)}`}
                    . Vale ver se dá pra adiantar uma entrada ou segurar um
                    pagamento.
                  </p>
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
