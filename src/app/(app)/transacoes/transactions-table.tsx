"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { MUTED_CATEGORY_COLOR, type CategoryColorPair } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
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
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function TransactionsTable({
  rows,
  accounts,
  categories,
  categoryColors,
  currency = "USD",
  selectionMode = false,
}: {
  rows: TransactionRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  categoryColors: Record<string, CategoryColorPair>;
  currency?: CurrencyCode;
  selectionMode?: boolean;
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
    return (
      <p className="py-10 text-center text-sm text-(--text-muted)">
        Nenhuma transação encontrada para esse período ou filtro.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-(--border-primary) bg-(--bg-subtle) px-3 py-2">
          <span className="text-sm font-medium text-(--text-primary)">{selected.size} selecionada(s)</span>
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
          <Button size="sm" disabled={!bulkCategoryId || isPending} onClick={applyBulkCategory}>
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
        const dayNet = dayRows.reduce(
          (sum, r) => sum + (r.direction === "in" ? r.amount_cents : -r.amount_cents),
          0,
        );

        return (
          <div key={date} className="flex flex-col gap-1">
            <div className="flex items-center gap-3 py-1.5">
              {selectionMode ? (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(dayIds, checked === true)}
                />
              ) : null}
              <span className="text-table-header shrink-0">{formatDayHeading(date)}</span>
              <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
              <span
                className="shrink-0 text-xs font-bold tabular-nums"
                style={{ color: dayNet < 0 ? "var(--expense)" : "var(--income)" }}
              >
                {dayNet < 0 ? "-" : "+"}
                {formatCents(Math.abs(dayNet), currency)}
              </span>
            </div>
            {dayRows.map((row) => {
              const CategoryIcon = getCategoryIcon(row.category_name, row.direction);
              const iconColors = row.category_name
                ? (categoryColors[row.category_name] ?? MUTED_CATEGORY_COLOR)
                : MUTED_CATEGORY_COLOR;

              return (
                <div
                  key={row.id}
                  className="flex min-h-[62px] items-center gap-3 px-1 transition-colors hover:bg-[#F9FAFB]"
                >
                  {selectionMode ? (
                    <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} />
                  ) : null}

                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: iconColors.bg, color: iconColors.fg }}
                  >
                    <CategoryIcon className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-(--text-primary)">
                      {row.description}
                    </p>
                    <p className="truncate text-xs text-(--text-muted)">{row.account_name}</p>
                  </div>

                  <span className="flex w-20 shrink-0 justify-start">
                    {row.status === "pending" ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                        style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning-dark)" }}
                      >
                        Pendente
                      </span>
                    ) : null}
                  </span>

                  <span className="w-40 shrink-0">
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
                        className="h-8 w-full justify-center rounded-full border-transparent text-center text-[12px] font-semibold"
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

                  <span
                    className="w-24 shrink-0 text-right text-sm font-bold tabular-nums"
                    style={{
                      color: row.direction === "out" ? "var(--table-amount-out)" : "var(--table-amount-in)",
                    }}
                  >
                    {row.direction === "out" ? "-" : "+"}
                    {formatCents(row.amount_cents, currency)}
                  </span>

                  <span className="flex shrink-0 items-center gap-0.5">
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
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
