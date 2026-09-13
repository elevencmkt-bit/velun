"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { MUTED_CATEGORY_COLOR, type CategoryColorPair } from "@/lib/category-colors";
import { bulkUpdateCategory, updateTransactionCategory } from "@/lib/actions/transactions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditTransactionDialog } from "@/components/edit-transaction-dialog";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";
import type { AccountOption, CategoryOption, TransactionRow } from "./types";

const NO_CATEGORY = "__none__";

function formatDayHeading(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function TransactionsTable({
  rows,
  accounts,
  categories,
  categoryColors,
  currency = "USD",
}: {
  rows: TransactionRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  categoryColors: Record<string, CategoryColorPair>;
  currency?: CurrencyCode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const router = useRouter();

  const groups = useMemo(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const row of rows) {
      if (!map.has(row.date)) map.set(row.date, []);
      map.get(row.date)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function applyBulkCategory() {
    const categoryId = bulkCategoryId === NO_CATEGORY ? null : bulkCategoryId || null;
    const ids = Array.from(selected);
    startTransition(async () => {
      await bulkUpdateCategory(ids, categoryId);
      setSelected(new Set());
      setBulkCategoryId("");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-(--ink)/70">Nenhuma transação encontrada.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-(--rule) bg-(--surface) px-3 py-2">
          <span className="text-sm">{selected.size} selecionada(s)</span>
          <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Recategorizar para..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkCategoryId || isPending}
            onClick={applyBulkCategory}
          >
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      ) : null}

      {groups.map(([date, dayRows]) => {
        const dayIds = dayRows.map((r) => r.id);
        const allSelected = dayIds.every((id) => selected.has(id));
        return (
          <div key={date} className="flex flex-col gap-1">
            <div className="text-table-header flex items-center gap-2 border-b border-(--border-primary) pb-1.5 capitalize">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(dayIds, checked === true)}
              />
              {formatDayHeading(date)}
            </div>
            {dayRows.map((row) => (
              <div
                key={row.id}
                className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 transition-colors hover:bg-[#F9FAFB]"
              >
                <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} />
                <span className="text-table-body w-40 truncate text-(--text-primary)">
                  {row.description}
                </span>
                <span className="text-table-body w-28">{row.account_name}</span>
                <span className="w-40">
                  <Select
                    value={row.category_id ?? NO_CATEGORY}
                    onValueChange={(value) => {
                      const categoryId = value === NO_CATEGORY ? null : value;
                      startTransition(async () => {
                        await updateTransactionCategory(row.id, categoryId);
                        router.refresh();
                      });
                    }}
                  >
                    <SelectTrigger
                      className="h-8 w-full border-transparent text-[13px] font-medium"
                      style={(() => {
                        if (!row.category_name) return undefined;
                        const pair = categoryColors[row.category_name] ?? MUTED_CATEGORY_COLOR;
                        return { backgroundColor: pair.bg, color: pair.fg };
                      })()}
                    >
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </span>
                <span className="text-table-body w-24">{row.creator_name ?? "—"}</span>
                <span className="text-table-body w-20">
                  {row.import_id ? "Importado" : "Manual"}
                </span>
                {row.status === "pending" ? (
                  <span
                    className="rounded-[6px] px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning-dark)" }}
                  >
                    pendente
                  </span>
                ) : null}
                <span
                  className="ml-auto text-right font-semibold tabular-nums"
                  style={{
                    color:
                      row.direction === "out"
                        ? "var(--table-amount-out)"
                        : "var(--table-amount-in)",
                  }}
                >
                  {row.direction === "out" ? "-" : "+"}
                  {formatCents(row.amount_cents, currency)}
                </span>
                <span className="flex items-center gap-0.5">
                  {row.transfer_group_id ? null : (
                    <EditTransactionDialog
                      transaction={{
                        id: row.id,
                        date: row.date,
                        account_id: row.account_id,
                        category_id: row.category_id,
                        direction: row.direction,
                        amount_cents: row.amount_cents,
                        description: row.description,
                        notes: row.notes,
                        status: row.status,
                        recurrence_id: row.recurrence_id,
                      }}
                      accounts={accounts}
                      categories={categories}
                    />
                  )}
                  <DeleteTransactionButton
                    transactionId={row.id}
                    transferGroupId={row.transfer_group_id}
                  />
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
