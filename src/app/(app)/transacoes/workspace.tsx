"use client";

import { useState } from "react";
import { ListChecks, X } from "lucide-react";
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
  TransactionRow,
} from "./types";

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
  totalLabel,
  totalDisplay,
  totalColor,
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
  totalLabel: string;
  totalDisplay: string;
  totalColor: string;
}) {
  const [selectionMode, setSelectionMode] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Transações</h1>
          <p className="text-page-subtitle">
            Acompanhe e gerencie todos os seus lançamentos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector
            label={monthLabel}
            prevHref={prevHref}
            nextHref={nextHref}
          />
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

      {/* No celular a lista vai de borda a borda, como no Organizze: sem a
          moldura do cartão, que ali só come largura. */}
      <Card className="max-md:-mx-4 max-md:rounded-none max-md:border-x-0 max-md:shadow-none max-md:[--card-spacing:--spacing(4)]">
        <CardContent className="flex flex-col gap-4 md:gap-5 md:pt-6">
          <TransactionFilters
            accounts={accounts}
            categories={categories}
            members={members}
          />

          <div className="flex items-center justify-between border-b border-(--border-soft) pb-3">
            <span className="flex flex-col">
              <span className="text-metadata">
                {rows.length} {rows.length === 1 ? "transação" : "transações"}
              </span>
              {scopeNote ? (
                <span className="text-xs text-(--text-muted)">{scopeNote}</span>
              ) : null}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-metadata">{totalLabel}</span>
              <span
                className="money font-semibold tabular-nums"
                style={{ color: totalColor }}
              >
                {totalDisplay}
              </span>
            </span>
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
