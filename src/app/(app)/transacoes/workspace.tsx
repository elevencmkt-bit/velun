"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ListChecks, X } from "lucide-react";
import { Money } from "@/components/money";
import type { CurrencyCode } from "@/lib/money";
import type { CategoryColorPair } from "@/lib/category-colors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthSelector } from "@/components/month-selector";
import { TransactionFilters } from "./filters";
import { TransactionsTable } from "./transactions-table";
import type {
  AccountOption,
  CategoryOption,
  MemberOption,
  StatusKey,
  TransactionRow,
  TransactionsSummary,
} from "./types";

const TABS: { key: StatusKey | "all"; label: string; badge: string }[] = [
  { key: "all", label: "Todas", badge: "bg-[#EAECF0] text-[#475467]" },
  { key: "late", label: "Atrasadas", badge: "bg-[#FEE4E2] text-[#B42318]" },
  { key: "pending", label: "Pendentes", badge: "bg-[#FEF0C7] text-[#B54708]" },
  { key: "confirmed", label: "Confirmadas", badge: "bg-[#EAECF0] text-[#475467]" },
];

export function TransactionsWorkspace({
  rows,
  accounts,
  editableAccounts,
  scopeNote,
  categories,
  members,
  categoryColors,
  categoryIcons,
  currency,
  monthLabel,
  prevHref,
  nextHref,
  summary,
  counts,
  activeStatus,
}: {
  rows: TransactionRow[];
  accounts: AccountOption[];
  /** Contas em que quem está vendo pode lançar/editar (casal + próprias). */
  editableAccounts: AccountOption[];
  /** "1 conta pessoal fora deste total", ou null. Nunca soma em silêncio. */
  scopeNote: string | null;
  categories: CategoryOption[];
  members: MemberOption[];
  categoryColors: Record<string, CategoryColorPair>;
  categoryIcons: Record<string, string | null>;
  currency: CurrencyCode;
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  summary: TransactionsSummary;
  counts: Record<StatusKey | "all", number>;
  activeStatus: StatusKey | "all";
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const net = summary.inCents - summary.outCents;

  function tabHref(key: StatusKey | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "all") params.delete("status");
    else params.set("status", key);
    const qs = params.toString();
    return `/transacoes${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Transações</h1>
          <p className="text-page-subtitle max-sm:hidden">Tudo o que entrou e saiu, dia a dia.</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector label={monthLabel} prevHref={prevHref} nextHref={nextHref} />
          <Button
            variant={selectionMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelectionMode((v) => !v)}
          >
            {selectionMode ? (
              <>
                <X className="h-3.5 w-3.5" /> Cancelar
              </>
            ) : (
              <>
                <ListChecks className="h-3.5 w-3.5" /> Selecionar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Resumo do período. No celular, uma faixa azul só; no computador,
          três blocos com o saldo em azul. */}
      <section className="relative overflow-hidden rounded-[20px] bg-(--primary) px-4 py-4 text-white md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/velun-mark.png" alt="" aria-hidden className="pointer-events-none absolute -top-14 -right-20 h-[220px] w-[260px] object-contain opacity-[0.1]" />
        <div className="relative grid grid-cols-3 gap-2">
          {[
            { label: "Entrou", cents: summary.inCents, sign: "" },
            { label: "Saiu", cents: summary.outCents, sign: "" },
            { label: "Saldo", cents: Math.abs(net), sign: net < 0 ? "−" : "" },
          ].map((k) => (
            <div key={k.label} className="min-w-0">
              <div className="text-[11px] text-white/80">{k.label}</div>
              <div className="truncate text-[15px] font-bold tabular-nums">
                {k.sign}
                <Money cents={k.cents} currency={currency} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-3 gap-5 max-md:hidden">
        <div className="rounded-[20px] bg-(--bg-surface) px-5 py-5 shadow-(--shadow-card)">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-(--income-soft) text-(--income-dark)">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
            <span className="text-[13px] text-(--text-muted)">Entrou</span>
          </div>
          <div className="mt-2.5 text-[26px] font-bold tabular-nums text-(--income-dark)">
            <Money cents={summary.inCents} currency={currency} />
          </div>
          <div className="mt-0.5 text-xs text-(--text-light)">
            {summary.inCount} {summary.inCount === 1 ? "entrada" : "entradas"}
            {summary.pendingInCount > 0
              ? summary.pendingInCount === summary.inCount
                ? summary.inCount === 1 ? " · pendente" : " · todas pendentes"
                : ` · ${summary.pendingInCount} pendente${summary.pendingInCount > 1 ? "s" : ""}`
              : ""}
          </div>
        </div>
        <div className="rounded-[20px] bg-(--bg-surface) px-5 py-5 shadow-(--shadow-card)">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-(--expense-soft) text-(--expense-dark)">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <span className="text-[13px] text-(--text-muted)">Saiu</span>
          </div>
          <div className="mt-2.5 text-[26px] font-bold tabular-nums text-(--text-primary)">
            <Money cents={summary.outCents} currency={currency} />
          </div>
          <div className="mt-0.5 text-xs text-(--text-light)">
            {summary.outCount} {summary.outCount === 1 ? "saída" : "saídas"}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[20px] bg-(--primary) px-5 py-5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/velun-mark.png" alt="" aria-hidden className="pointer-events-none absolute -top-12 -right-20 h-[200px] w-[260px] object-contain opacity-[0.12]" />
          <div className="relative flex h-8 items-center text-[13px] text-white/85">Saldo do período</div>
          <div className="relative mt-2.5 text-[26px] font-bold tabular-nums">
            {net < 0 ? "−" : ""}
            <Money cents={Math.abs(net)} currency={currency} />
          </div>
          <div className="relative mt-0.5 text-xs text-white/75">
            {net < 0 ? "Entrou menos do que saiu" : net > 0 ? "Entrou mais do que saiu" : "Empatou"}
            {scopeNote ? ` · ${scopeNote}` : ""}
          </div>
        </div>
      </div>

      <Card className="max-md:[--card-spacing:--spacing(4)]">
        <CardContent className="flex flex-col gap-4 md:gap-5 md:pt-1">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:w-fit md:shrink-0 md:gap-1 md:rounded-[14px] md:bg-[#F4F5F8] md:p-1 md:px-1">
              {TABS.map((t) => {
                const on = activeStatus === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => router.push(tabHref(t.key))}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors md:rounded-[11px] ${
                      on
                        ? "bg-(--text-primary) text-white md:bg-(--bg-surface) md:text-(--text-primary) md:shadow-[0_1px_3px_rgba(16,24,40,.08)]"
                        : "bg-[#F4F5F8] text-(--text-muted) md:bg-transparent"
                    }`}
                  >
                    {t.label}
                    <span
                      className={`rounded-full px-1.5 py-px text-[11px] font-bold ${
                        on && t.key === "all" ? "max-md:bg-white/20 max-md:text-white md:bg-[#EAECF0] md:text-[#475467]" : t.badge
                      }`}
                    >
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>
            <TransactionFilters accounts={accounts} categories={categories} members={members} />
          </div>

          <TransactionsTable
            key={selectionMode ? "selecting" : "browsing"}
            rows={rows}
            accounts={editableAccounts}
            categories={categories}
            categoryColors={categoryColors}
            categoryIcons={categoryIcons}
            currency={currency}
            selectionMode={selectionMode}
          />
        </CardContent>
      </Card>
    </div>
  );
}
