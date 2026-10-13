import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { loadCards } from "@/lib/cards";
import { STATUS_LABELS, type Statement } from "@/lib/credit-card";
import {
  getCategoryColorMap,
  MUTED_CATEGORY_COLOR,
} from "@/lib/category-colors";
import { getCategoryIcon, getCategoryIconMap } from "@/lib/category-icons";
import type { CurrencyCode } from "@/lib/money";
import { CardArt } from "@/components/card-art";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { AccountForm } from "../contas/account-form";
import { PayBillDialog } from "./pay-bill-dialog";
import { themedPair } from "@/lib/theme-color";
import { CATEGORY_JOIN, resolveJoinedCategory } from "@/lib/subcategories";

function shortDate(date: string) {
  return new Date(`${date}T12:00:00`)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    .replace(" de ", " ")
    .replace(".", "");
}

function monthName(date: string) {
  const name = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const STATUS_STYLE: Record<Statement["status"], { bg: string; fg: string }> = {
  open: { bg: "var(--primary-light)", fg: "var(--primary-hover)" },
  closed: { bg: "var(--warning-soft)", fg: "var(--warning-dark)" },
  paid: { bg: "var(--income-soft)", fg: "var(--income-dark)" },
  overdue: { bg: "var(--expense-soft)", fg: "var(--expense-dark)" },
};

function Pill({ status }: { status: Statement["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
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

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ cartao?: string; fatura?: string }>;
}) {
  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();
  const params = await searchParams;

  const [cards, { data: accountRows }, colorMap, iconMap] = await Promise.all([
    loadCards(supabase, householdId, memberId, today),
    supabase
      .from("accounts")
      .select("id, name, type, owner_id")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .neq("type", "credit_card")
      .order("name"),
    getCategoryColorMap(supabase, householdId),
    getCategoryIconMap(supabase, householdId),
  ]);

  // Contas que podem pagar fatura: do casal ou minhas, que não são cartão.
  const payers = (accountRows ?? [])
    .filter((a) => a.owner_id === null || a.owner_id === memberId)
    .map((a) => ({ id: a.id as string, name: a.name as string }));

  const newCardButton = (
    <AccountForm
      paymentAccounts={payers}
      defaultType="credit_card"
      trigger={
        <Button className="h-11 rounded-[14px] px-4 text-[14px] font-semibold">
          <Plus className="h-4 w-4" /> Novo cartão
        </Button>
      }
    />
  );

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page-title">Cartões</h1>
        <p className="text-page-subtitle">
          Cada compra entra na fatura certa. Pagar a fatura não conta como gasto
          de novo.
        </p>
      </div>
      {newCardButton}
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-6 md:gap-7">
        {header}
        <section
          className="flex flex-col items-center gap-5 rounded-[20px] bg-(--bg-surface) px-6 py-10 text-center md:flex-row md:gap-10 md:px-10 md:text-left"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="w-full max-w-[300px] shrink-0">
            <CardArt
              name="Seu cartão"
              color="ink"
              lastFour="0000"
              caption="Fatura aberta"
              amount={<Money cents={0} currency={currency} />}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-card-title">Nenhum cartão ainda</h2>
            <p className="max-w-[460px] text-sm leading-relaxed text-(--text-muted)">
              Cadastre o cartão com o dia em que a fatura fecha e o dia em que
              vence. Depois é só lançar as compras nele: o Velun monta as
              faturas, mostra o vencimento em A vencer e conta cada compra como
              gasto uma vez só.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const selected = cards.find((c) => c.id === params.cartao) ?? cards[0];
  // Abas de fatura: as mais recentes, terminando na aberta (ou na seguinte,
  // se já tem compra prevista nela).
  const tabs = selected.statements.slice(-4);
  const statement =
    tabs.find((s) => s.closing === params.fatura) ??
    tabs.find((s) => s.closing === selected.current.closing) ??
    tabs[tabs.length - 1];

  const { data: purchaseRows } = selected.canSeeTransactions
    ? await supabase
        // limite: lançamentos de uma fatura só
        .from("transactions")
        .select(
          `id, date, description, amount_cents, direction, status, transfer_group_id, installment_number, installment_total, ${CATEGORY_JOIN}`,
        )
        .eq("household_id", householdId)
        .eq("account_id", selected.id)
        .gte("date", statement.start)
        .lte("date", statement.closing)
        .order("date", { ascending: false })
    : { data: null };

  const purchases = (purchaseRows ?? []).filter((r) => !r.transfer_group_id);
  const payments = (purchaseRows ?? []).filter(
    (r) => r.transfer_group_id && r.direction === "in",
  );

  // Parcelas que ainda vão cair nas próximas faturas deste cartão.
  const { data: futureParcels } = selected.canSeeTransactions
    ? await supabase
        // limite: parcelas futuras de um cartão
        .from("transactions")
        .select("amount_cents")
        .eq("household_id", householdId)
        .eq("account_id", selected.id)
        .not("installment_group_id", "is", null)
        .gt("date", selected.current.closing)
    : { data: null };
  const futureParcelsCents = (futureParcels ?? []).reduce(
    (sum, r) => sum + (r.amount_cents as number),
    0,
  );
  const futureParcelsCount = futureParcels?.length ?? 0;

  // Fatura de um mês que ainda nem abriu (só tem parcelas ou compras
  // previstas): mostra só o que é dela. O que ficar em aberto antes entra
  // nela também, mas isso ainda não aconteceu.
  const isFuture = statement.closing > selected.current.closing;
  const shownTotal = isFuture
    ? Math.max(0, statement.chargesCents - statement.creditsCents)
    : statement.totalCents;
  // O que veio da fatura anterior (sem pagar) e está somado nesta.
  const carriedCents = isFuture
    ? 0
    : Math.max(
        0,
        statement.totalCents -
          (statement.chargesCents - statement.creditsCents),
      );

  const toPay =
    statement.status === "open"
      ? Math.max(
          0,
          statement.totalCents - (selected.lastClosed?.remainingCents ?? 0),
        )
      : statement.remainingCents;
  const usedPct = selected.limitCents
    ? Math.min(100, (selected.debtCents / selected.limitCents) * 100)
    : null;
  const href = (cardId: string, fatura?: string) =>
    `/cartoes?cartao=${cardId}${fatura ? `&fatura=${fatura}` : ""}`;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      {header}

      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 xl:grid-cols-3">
        {cards.map((card) => {
          const active = card.id === selected.id;
          return (
            <Link
              key={card.id}
              href={href(card.id)}
              aria-current={active ? "true" : undefined}
              className="block w-[280px] shrink-0 snap-start rounded-[20px] transition-transform md:w-auto"
              style={{
                boxShadow: active
                  ? "0 0 0 3px var(--bg-app), 0 0 0 5px var(--primary)"
                  : "none",
              }}
            >
              <CardArt
                name={card.name}
                color={card.color}
                lastFour={card.lastFour}
                owner={card.ownerLabel}
                caption={`Fatura aberta · vence ${shortDate(card.current.due)}`}
                amount={
                  <Money cents={card.current.totalCents} currency={currency} />
                }
              />
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        <section
          className="min-w-0 rounded-[20px] bg-(--bg-surface) p-5 md:p-6 lg:col-span-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-card-title">Fatura · {selected.name}</h2>
            <nav
              aria-label="Faturas"
              className="flex max-w-full gap-1 overflow-x-auto rounded-[14px] bg-(--bg-app) p-1 [scrollbar-width:none]"
            >
              {tabs.map((s) => {
                const active = s.closing === statement.closing;
                return (
                  <Link
                    key={s.closing}
                    href={href(selected.id, s.closing)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] px-3 text-[13px] font-semibold transition-colors ${
                      active
                        ? "bg-(--bg-surface) text-(--text-primary) shadow-sm"
                        : "text-(--text-muted) hover:text-(--text-primary)"
                    }`}
                  >
                    {monthName(s.closing)}
                    <span className="font-medium text-(--text-light)">
                      ·{" "}
                      {s.closing > selected.current.closing
                        ? "próxima"
                        : STATUS_LABELS[s.status].toLowerCase()}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {!selected.canSeeTransactions ? (
            <div className="flex items-center gap-3 rounded-[14px] bg-(--bg-subtle) p-4 text-sm text-(--text-muted)">
              <Lock className="h-4 w-4 shrink-0" />
              Cartão pessoal de {selected.ownerLabel}: aparece só o total de
              cada fatura.
            </div>
          ) : purchases.length === 0 && carriedCents === 0 ? (
            <p className="py-6 text-sm text-(--text-muted)">
              Nenhuma compra nesta fatura ainda. Lance as compras escolhendo
              este cartão como conta.
            </p>
          ) : purchases.length === 0 ? (
            <div className="flex min-h-[60px] items-center gap-3 rounded-[14px] bg-(--bg-subtle) px-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Saldo da fatura anterior
                </p>
                <p className="text-xs text-(--text-muted)">
                  Ficou sem pagar e passou pra esta fatura. Nenhuma compra nova
                  ainda.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                <Money cents={carriedCents} currency={currency} />
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              {purchases.map((row) => {
                const category = resolveJoinedCategory(row.category as never).name;
                const out = row.direction === "out";
                const Icon = getCategoryIcon(
                  category,
                  out ? "out" : "in",
                  category ? (iconMap.get(category) ?? null) : null,
                );
                const colors = themedPair(
                  category
                    ? (colorMap.get(category) ?? MUTED_CATEGORY_COLOR)
                    : MUTED_CATEGORY_COLOR,
                );
                return (
                  <div
                    key={row.id}
                    className="flex min-h-[60px] items-center gap-3 border-b border-(--border-soft) last:border-0"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{ background: colors.bg, color: colors.fg }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {out ? row.description : `Estorno · ${row.description}`}
                        {row.installment_total ? (
                          <span className="ml-2 rounded-full bg-(--primary-light) px-2 py-0.5 text-[11px] font-semibold text-(--primary-hover)">
                            {row.installment_number} de {row.installment_total}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-(--text-muted)">
                        {shortDate(row.date as string)} ·{" "}
                        {category ?? "Sem categoria"}
                        {row.status === "pending" ? " · prevista" : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-sm font-semibold tabular-nums"
                      style={{
                        color: out
                          ? "var(--text-primary)"
                          : "var(--income-dark)",
                      }}
                    >
                      {out ? "" : "−"}
                      <Money
                        cents={row.amount_cents as number}
                        currency={currency}
                      />
                    </span>
                  </div>
                );
              })}
              {payments.length > 0 ? (
                <p className="mt-3 text-xs text-(--text-muted)">
                  Pagamentos feitos dentro deste período já descontados no
                  total.
                </p>
              ) : null}
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:col-span-4">
          <section
            className="rounded-[20px] bg-(--bg-surface) p-5 md:p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-(--text-muted)">
                Fatura de {monthName(statement.closing).toLowerCase()}
              </span>
              {isFuture ? (
                <span className="rounded-full bg-(--bg-subtle) px-2 py-0.5 text-[11px] font-semibold text-(--text-muted)">
                  Próxima
                </span>
              ) : (
                <Pill status={statement.status} />
              )}
            </div>
            <div className="mt-1.5 text-[30px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
              <Money cents={shownTotal} currency={currency} />
            </div>
            {carriedCents > 0 && purchases.length > 0 ? (
              <div className="mt-1 text-[13px] text-(--text-muted)">
                Inclui <Money cents={carriedCents} currency={currency} /> que
                ficou da fatura anterior.
              </div>
            ) : null}
            {isFuture ? (
              <div className="mt-1 text-[13px] text-(--text-muted)">
                Já lançado pra este mês. O que ficar sem pagar antes entra aqui
                também.
              </div>
            ) : null}
            {statement.paidCents > 0 && statement.status !== "open" ? (
              <div className="mt-1 text-[13px] text-(--text-muted)">
                Pago{" "}
                <Money
                  cents={Math.min(statement.paidCents, statement.totalCents)}
                  currency={currency}
                />
                {statement.remainingCents > 0 ? (
                  <>
                    {" · falta "}
                    <Money
                      cents={statement.remainingCents}
                      currency={currency}
                    />
                  </>
                ) : null}
              </div>
            ) : null}

            {usedPct !== null ? (
              <>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-(--bg-subtle)">
                  <div
                    className="h-full rounded-full bg-(--primary)"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-(--text-muted)">
                  <span>
                    Limite{" "}
                    <Money cents={selected.limitCents!} currency={currency} />
                  </span>
                  <span>
                    <Signed
                      cents={selected.limitCents! - selected.debtCents}
                      currency={currency}
                    />{" "}
                    livres
                  </span>
                </div>
              </>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[14px] bg-(--bg-subtle) p-3">
                <div className="text-xs text-(--text-muted)">Fecha</div>
                <div className="mt-0.5 text-[15px] font-bold">
                  {shortDate(statement.closing)}
                </div>
              </div>
              <div className="rounded-[14px] bg-(--bg-subtle) p-3">
                <div className="text-xs text-(--text-muted)">Vence</div>
                <div className="mt-0.5 text-[15px] font-bold">
                  {shortDate(statement.due)}
                </div>
              </div>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-(--text-secondary)">
              {selected.paymentAccountName ? (
                <>
                  Paga com <b>{selected.paymentAccountName}</b>.
                </>
              ) : (
                "Sem conta de pagamento definida."
              )}{" "}
              Compras até o dia {selected.closeDay} entram na fatura do mês;
              depois, na seguinte.
            </p>

            {selected.canEdit &&
            !isFuture &&
            toPay > 0 &&
            statement.status !== "paid" ? (
              <div className="mt-5">
                <PayBillDialog
                  cardId={selected.id}
                  cardName={selected.name}
                  suggestedCents={toPay}
                  payers={payers}
                  defaultPayerId={selected.paymentAccountId}
                  label={
                    statement.status === "open"
                      ? "Adiantar pagamento"
                      : "Pagar fatura"
                  }
                />
              </div>
            ) : null}
          </section>

          {futureParcelsCount > 0 ? (
            <section className="rounded-[20px] bg-(--primary-soft) p-5 md:p-6">
              <div className="text-[14px] font-bold text-(--primary-hover)">
                Parcelas que ainda vêm
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-(--text-secondary)">
                <Money cents={futureParcelsCents} currency={currency} /> em{" "}
                {futureParcelsCount}{" "}
                {futureParcelsCount === 1 ? "parcela" : "parcelas"} nas próximas
                faturas. Já contam no limite usado.
              </p>
            </section>
          ) : null}

          {selected.canEdit ? (
            <p className="px-1 text-xs leading-relaxed text-(--text-muted)">
              Pra mudar fechamento, vencimento, limite ou cor, edite o cartão em{" "}
              <Link href="/contas" className="font-semibold text-(--primary)">
                Contas
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
