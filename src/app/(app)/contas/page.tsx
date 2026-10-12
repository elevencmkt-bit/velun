import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import { AccountAvatar } from "@/components/account-avatar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getAccountBalances } from "@/lib/balances";
import { accountScope } from "@/lib/visibility";
import { CardArt } from "@/components/card-art";
import { AccountForm } from "./account-form";
import { AccountRowActions } from "./account-row-actions";
import { Money } from "@/components/money";

// Texto curto pro badge da conta pessoal do outro membro. Diz o que ele
// escolheu mostrar, sem revelar nada além disso.
const VISIBILITY_BADGE: Record<string, string> = {
  balance_only: "Só o saldo",
  categories_only: "Sem lançamentos",
  shared: "Aberta",
};

// Nas minhas contas pessoais: o que quem divide a casa enxerga.
const MY_VISIBILITY: Record<string, (who: string | null) => string> = {
  hidden: (who) => (who ? `${who} não vê` : "Oculta"),
  balance_only: (who) => `${who ?? "Visível"}${who ? " vê" : ""}: só o saldo`,
  categories_only: (who) => `${who ?? "Visível"}${who ? " vê" : ""}: saldo e categorias`,
  shared: (who) => `${who ?? "Visível"}${who ? " vê" : ""}: tudo`,
};

export default async function ContasPage() {
  const { householdId, memberId, currency } = await getCurrentMember();
  const supabase = await createClient();

  const [{ data: accounts }, balances, { data: members }] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, type, institution, is_archived, opening_balance_cents, owner_id, visibility, credit_limit_cents, statement_close_day, payment_due_day, payment_account_id, last_four, card_color",
      )
      .eq("household_id", householdId)
      .order("sort_order")
      .order("name"),
    accountScope(supabase, householdId, memberId, "balance").then((scope) =>
      getAccountBalances(supabase, householdId, scope),
    ),
    supabase.from("members").select("id, display_name").eq("household_id", householdId),
  ]);

  const memberNames = new Map(
    (members ?? []).map((m) => [m.id as string, m.display_name as string]),
  );
  // Quem divide a casa comigo (pro "Fulana vê: …" das minhas contas).
  const partner = (members ?? []).find((m) => m.id !== memberId);
  const partnerFirst = partner ? String(partner.display_name).trim().split(/\s+/)[0] : null;

  const all = accounts ?? [];
  const active = all.filter((a) => !a.is_archived);
  const archived = all.filter((a) => a.is_archived);
  const bal = (id: string) => balances.get(id) ?? 0;

  // Saldo total é dinheiro nas contas; o que se deve no cartão aparece à
  // parte e entra no saldo quando a fatura é paga.
  const nonCards = active.filter((a) => a.type !== "credit_card");
  const cards = active.filter((a) => a.type === "credit_card");
  const investedCents = nonCards.filter((a) => a.type === "investment").reduce((n, a) => n + bal(a.id), 0);
  const total = nonCards.reduce((n, a) => n + bal(a.id), 0);
  const inAccountsCents = total - investedCents;
  const cardDebtCents = cards.reduce((n, a) => n + Math.max(0, -bal(a.id)), 0);

  // Quem pode pagar fatura: conta ativa, que não é cartão, do casal ou minha.
  const paymentAccounts = nonCards
    .filter((a) => a.owner_id === null || a.owner_id === memberId)
    .map((a) => ({ id: a.id as string, name: a.name as string }));

  const editable = (a: (typeof all)[number]) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    opening_balance_cents: a.opening_balance_cents,
    owner_id: a.owner_id,
    visibility: a.visibility,
    credit_limit_cents: a.credit_limit_cents,
    statement_close_day: a.statement_close_day,
    payment_due_day: a.payment_due_day,
    payment_account_id: a.payment_account_id,
    last_four: a.last_four,
    card_color: a.card_color,
  });

  const groups: { title: string; note: string; items: typeof all }[] = [
    { title: "Do casal", note: "Os dois veem tudo", items: nonCards.filter((a) => a.owner_id === null) },
    { title: "Minhas", note: partnerFirst ? `Você escolhe o que ${partnerFirst} vê` : "Você escolhe o que o outro vê", items: nonCards.filter((a) => a.owner_id === memberId) },
  ];
  // Contas pessoais dos outros: só as que eles deixaram aparecer.
  for (const [id, name] of memberNames) {
    if (id === memberId) continue;
    const items = nonCards.filter((a) => a.owner_id === id);
    if (items.length > 0) {
      groups.push({ title: `De ${String(name).trim().split(/\s+/)[0]}`, note: "Só o que ela escolheu mostrar", items });
    }
  }

  const row = (a: (typeof all)[number]) => {
    const balance = bal(a.id);
    const isPersonal = a.owner_id !== null;
    const isMine = a.owner_id === memberId;
    const canManage = !isPersonal || isMine;
    const isCard = a.type === "credit_card";
    const chip = isMine
      ? MY_VISIBILITY[a.visibility]?.(partnerFirst)
      : isPersonal
        ? VISIBILITY_BADGE[a.visibility]
        : null;
    return (
      <div key={a.id} className="flex min-h-[72px] items-center gap-3 border-b border-(--border-soft) py-3 last:border-0 md:gap-3.5">
        <AccountAvatar institution={a.institution} type={a.type} size={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-(--text-primary)">{a.name}</div>
          <div className="truncate text-xs text-(--text-muted)">
            {ACCOUNT_TYPE_LABELS[a.type] ?? a.type}
            {a.institution ? ` · ${a.institution}` : ""}
            {chip ? <span className="md:hidden"> · {chip}</span> : null}
          </div>
        </div>
        {chip ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[#F4F5F8] px-2.5 text-xs font-semibold text-(--text-secondary) max-md:hidden">
            {a.visibility === "hidden" && isMine ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {chip}
          </span>
        ) : null}
        <span
          className="shrink-0 text-[15px] font-bold tabular-nums md:text-[17px]"
          style={{ color: !isCard && balance < 0 ? "var(--expense-dark)" : undefined }}
        >
          {isCard ? <Money cents={Math.max(0, -balance)} currency={currency} /> : <Money cents={balance} currency={currency} />}
        </span>
        {canManage ? (
          <AccountRowActions account={editable(a)} isArchived={a.is_archived} paymentAccounts={paymentAccounts} />
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-start justify-between gap-3 sm:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-page-title">Contas</h1>
          <p className="text-page-subtitle max-sm:hidden">Saldo de cada conta, a partir dos lançamentos confirmados.</p>
        </div>
        <AccountForm paymentAccounts={paymentAccounts} />
      </div>

      {all.length === 0 ? (
        <p className="text-sm text-(--text-muted)">
          Nenhuma conta ainda. Crie a primeira para começar a lançar transações.
        </p>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[24px] bg-(--primary) p-5 text-white md:px-8 md:py-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/velun-mark.png"
              alt=""
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-28 h-[360px] w-[420px] object-contain opacity-[0.12] md:-top-28 md:-right-24 md:h-[420px] md:w-[520px]"
            />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
              <div>
                <div className="text-sm text-white/80">Saldo total</div>
                <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[44px]">
                  <Money cents={total} currency={currency} />
                </div>
                <div className="mt-1 text-[13px] text-white/75 max-md:hidden">
                  Contas e investimentos. Cartão não entra: é dívida, aparece à parte.
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 md:gap-3 lg:min-w-[520px]">
                {[
                  { label: "Em contas", short: "Em contas", cents: inAccountsCents },
                  { label: "Investimentos", short: "Investido", cents: investedCents },
                  { label: "Devendo nos cartões", short: "Cartões", cents: cardDebtCents },
                ].map((k) => (
                  <div key={k.label} className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
                    <div className="text-[11px] text-white/80 md:text-xs">
                      <span className="md:hidden">{k.short}</span>
                      <span className="max-md:hidden">{k.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">
                      <Money cents={k.cents} currency={currency} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {groups.map((g) => (
              <div key={g.title} className="min-w-0">
                <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-card-title">{g.title}</h2>
                  <span className="truncate text-[13px] text-(--text-muted)">{g.note}</span>
                </div>
                {g.items.length > 0 ? (
                  <section className="rounded-[20px] bg-(--bg-surface) px-4 shadow-(--shadow-card) md:px-6">
                    {g.items.map(row)}
                  </section>
                ) : (
                  <p className="rounded-[16px] border-[1.5px] border-dashed border-[#D0D5DD] px-4 py-3.5 text-[13px] text-(--text-muted)">
                    Nenhuma conta aqui ainda.
                  </p>
                )}
                {g.title === "Minhas" && !partner ? (
                  <p className="mt-3.5 rounded-[16px] border-[1.5px] border-dashed border-[#D0D5DD] px-4 py-3.5 text-[13px] leading-relaxed text-(--text-muted)">
                    Quando quem divide a casa entrar, as contas dela aparecem aqui ao lado — só com o que ela liberar pra você.
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {cards.length > 0 ? (
            <div>
              <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-card-title">Cartões de crédito</h2>
                <Link href="/cartoes" className="text-[13px] font-semibold text-(--primary)">
                  Ver faturas →
                </Link>
              </div>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-3">
                {cards.map((a) => {
                  const isMine = a.owner_id === memberId;
                  const owner = a.owner_id === null ? "Do casal" : isMine ? "Minha" : (memberNames.get(a.owner_id as string) ?? "");
                  return (
                    <div key={a.id} className="relative w-[240px] shrink-0 snap-start md:w-auto">
                      <Link href={`/cartoes?cartao=${a.id}`} className="block rounded-[18px] transition-transform hover:-translate-y-0.5">
                        <CardArt
                          name={a.name}
                          color={a.card_color ?? "ink"}
                          lastFour={a.last_four}
                          caption="Você deve"
                          amount={<Money cents={Math.max(0, -bal(a.id))} currency={currency} />}
                          owner={owner}
                          size="sm"
                        />
                      </Link>
                      <div className="mt-1.5 flex items-center justify-between gap-2 pl-1">
                        <span className="truncate text-xs text-(--text-muted)">
                          {a.statement_close_day && a.payment_due_day
                            ? `Fecha dia ${a.statement_close_day} · vence dia ${a.payment_due_day}`
                            : (ACCOUNT_TYPE_LABELS[a.type] ?? "")}
                        </span>
                        {a.owner_id === null || isMine ? (
                          <AccountRowActions account={editable(a)} isArchived={false} paymentAccounts={paymentAccounts} />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {archived.length > 0 ? (
            <div className="opacity-70">
              <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-card-title">Arquivadas</h2>
                <span className="text-[13px] text-(--text-muted)">Fora dos totais</span>
              </div>
              <section className="rounded-[20px] bg-(--bg-surface) px-4 shadow-(--shadow-card) md:px-6">
                {archived.map(row)}
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
