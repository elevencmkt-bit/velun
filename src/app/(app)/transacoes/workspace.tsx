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
import type { AccountOption, CategoryOption, MemberOption, TransactionRow } from "./types";

export function TransactionsWorkspace({
  rows,
  accounts,
  categories,
  members,
  categoryColors,
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
  categories: CategoryOption[];
  members: MemberOption[];
  categoryColors: Record<string, CategoryColorPair>;
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Transações</h1>
          <p className="text-page-subtitle">Acompanhe e gerencie todos os seus lançamentos.</p>
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

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <TransactionFilters accounts={accounts} categories={categories} members={members} />

          <div className="flex items-center justify-between border-b border-(--border-soft) pb-3">
            <span className="text-metadata">
              {rows.length} {rows.length === 1 ? "transação" : "transações"}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-metadata">{totalLabel}</span>
              <span className="font-semibold tabular-nums" style={{ color: totalColor }}>
                {totalDisplay}
              </span>
            </span>
          </div>

          <TransactionsTable
            key={selectionMode ? "selecting" : "browsing"}
            rows={rows}
            accounts={accounts}
            categories={categories}
            categoryColors={categoryColors}
            currency={currency}
            selectionMode={selectionMode}
          />
        </CardContent>
      </Card>
    </div>
  );
}
