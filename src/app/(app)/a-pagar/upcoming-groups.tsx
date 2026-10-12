"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CARD_COLORS } from "@/lib/credit-card";
import { Check } from "lucide-react";
import type { CurrencyCode } from "@/lib/money";
import { markTransactionPaid } from "@/lib/actions/transactions";
import { Money } from "@/components/money";

export type PendingRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  account_name: string;
  category_name: string | null;
  recurring: boolean;
  /** Conta do casal ou própria. Da conta "aberta" do outro, só leitura. */
  can_edit: boolean;
  /** Fatura de cartão: não é lançamento, abre a fatura em vez de "Pagar". */
  bill?: { href: string; color: string };
};

export type Group = {
  key: "overdue" | "week" | "later";
  title: string;
  subtitle?: string;
  rows: PendingRow[];
};

const COLLAPSED = 5;

const DOT: Record<Group["key"], string> = {
  overdue: "var(--expense-dark)",
  week: "var(--primary)",
  later: "#C9CFDA",
};

function dayBlock(date: string, overdue: boolean) {
  const d = new Date(`${date}T00:00:00`);
  const label = overdue
    ? d.toLocaleDateString("pt-BR", { month: "short" })
    : d.toLocaleDateString("pt-BR", { weekday: "short" });
  return { day: String(d.getDate()).padStart(2, "0"), label: label.replace(".", "").toUpperCase() };
}

function GroupCard({ group, currency }: { group: Group; currency: CurrencyCode }) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  const overdue = group.key === "overdue";
  const visible = expanded ? group.rows : group.rows.slice(0, COLLAPSED);
  const hidden = group.rows.length - visible.length;
  const totalOut = group.rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount_cents, 0);
  const totalIn = group.rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount_cents, 0);

  function settle(id: string) {
    setBusyId(id);
    startTransition(async () => {
      await markTransactionPaid(id);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <section
      className="rounded-[20px] p-5 md:p-6"
      style={{
        background: overdue ? "#FFF7F8" : "#FFFFFF",
        boxShadow: overdue ? "none" : "var(--shadow-card)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="h-2 w-2 rounded-full" style={{ background: DOT[group.key] }} />
        <h2 className="text-card-title">{group.title}</h2>
        <span
          className="text-[13px] font-semibold"
          style={{ color: overdue ? "var(--expense-dark)" : "var(--text-muted)" }}
        >
          {group.rows.length}
          {totalOut > 0 ? (
            <>
              {" · −"}
              <Money cents={totalOut} currency={currency} />
            </>
          ) : null}
          {totalIn > 0 ? (
            <>
              {" · +"}
              <Money cents={totalIn} currency={currency} />
            </>
          ) : null}
        </span>
        {group.subtitle ? <span className="text-[12px] text-(--text-light) sm:ml-auto">{group.subtitle}</span> : null}
      </div>

      <div className="flex flex-col">
        {visible.map((row) => {
          const { day, label } = dayBlock(row.date, overdue || group.key === "later");
          const out = row.direction === "out";
          return (
            <div
              key={row.id}
              className="-mx-3 flex min-h-[64px] items-center gap-3 rounded-[14px] px-3 transition-colors hover:bg-black/[0.02] md:gap-4"
            >
              <div className="w-11 shrink-0 text-center">
                <div className="text-[18px] leading-none font-extrabold">{day}</div>
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: overdue ? "var(--expense-dark)" : "var(--text-light)" }}
                >
                  {label}
                </div>
              </div>
              {row.bill ? (
                <div
                  aria-hidden
                  className="h-[22px] w-[34px] shrink-0 rounded-[5px]"
                  style={{ background: (CARD_COLORS[row.bill.color] ?? CARD_COLORS.ink).bg }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-(--text-primary)">{row.description}</p>
                <p className="truncate text-xs text-(--text-muted)">
                  {row.account_name}
                  {row.category_name ? ` · ${row.category_name}` : ""}
                  {row.recurring ? " · se repete" : ""}
                </p>
              </div>
              <span
                className="shrink-0 text-right text-[14px] font-bold tabular-nums md:text-[15px]"
                style={{ color: out ? "var(--expense-dark)" : "var(--income-dark)" }}
              >
                {out ? "−" : "+"}
                <Money cents={row.amount_cents} currency={currency} />
              </span>
              {row.bill ? (
                <Link
                  href={row.bill.href}
                  className="flex h-9 shrink-0 items-center rounded-xl bg-[#F1F3F7] px-3 text-[13px] font-semibold text-(--text-primary) transition-colors hover:bg-(--primary-light) hover:text-(--primary-hover)"
                >
                  Ver fatura
                </Link>
              ) : row.can_edit ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => settle(row.id)}
                  aria-label={out ? `Marcar ${row.description} como paga` : `Marcar ${row.description} como recebida`}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#F1F3F7] px-3 text-[13px] font-semibold text-(--text-primary) transition-colors hover:bg-(--primary-light) hover:text-(--primary-hover) disabled:opacity-60 max-sm:w-9 max-sm:justify-center max-sm:px-0"
                >
                  <Check className="h-4 w-4 sm:hidden" />
                  <span className="max-sm:hidden">{busyId === row.id ? "…" : out ? "Pagar" : "Recebi"}</span>
                </button>
              ) : (
                <span className="w-14 shrink-0 text-right text-xs text-(--text-muted)" title="Conta pessoal de outra pessoa">
                  Só leitura
                </span>
              )}
            </div>
          );
        })}
      </div>

      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[13px] font-semibold text-(--primary) hover:text-(--primary-hover)"
        >
          {expanded ? "Mostrar menos" : `Ver ${hidden === 1 ? "a outra" : `as outras ${hidden}`}`}
        </button>
      ) : null}
    </section>
  );
}

export function UpcomingGroups({ groups, currency }: { groups: Group[]; currency: CurrencyCode }) {
  const nonEmpty = groups.filter((g) => g.rows.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <section className="rounded-[20px] bg-white p-6 text-sm text-(--text-muted)" style={{ boxShadow: "var(--shadow-card)" }}>
        Nada vencendo nos próximos 30 dias.
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {nonEmpty.map((group) => (
        <GroupCard key={group.key} group={group} currency={currency} />
      ))}
    </div>
  );
}
