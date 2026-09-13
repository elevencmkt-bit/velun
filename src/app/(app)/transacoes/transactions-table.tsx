"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { MUTED_SLICE_COLOR } from "@/lib/category-colors";
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
import type { CategoryOption, TransactionRow } from "./types";

const NO_CATEGORY = "__none__";

function formatDayHeading(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function TransactionsTable({
  rows,
  categories,
  categoryColors,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
  categoryColors: Record<string, string>;
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
    return <p className="text-sm text-[--ink]/70">Nenhuma transação encontrada.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-[--rule] bg-[--surface] px-3 py-2">
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
            <div className="flex items-center gap-2 border-b border-[--rule] pb-1 text-sm font-medium capitalize text-[--ink]/70">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(dayIds, checked === true)}
              />
              {formatDayHeading(date)}
            </div>
            {dayRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 border-b border-[--rule]/60 py-2 text-sm"
              >
                <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} />
                <span className="w-40 truncate">{row.description}</span>
                <span className="w-28 text-[--ink]/60">{row.account_name}</span>
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
                      className="h-8 w-full border-transparent text-sm font-medium"
                      style={{
                        backgroundColor: row.category_name
                          ? `color-mix(in srgb, ${
                              row.direction === "in"
                                ? "var(--badge-green-fg)"
                                : (categoryColors[row.category_name] ?? MUTED_SLICE_COLOR)
                            } 16%, white)`
                          : undefined,
                      }}
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
                <span className="w-24 text-[--ink]/60">{row.creator_name ?? "—"}</span>
                <span className="w-20 text-[--ink]/60">
                  {row.import_id ? "Importado" : "Manual"}
                </span>
                {row.status === "pending" ? (
                  <span className="text-xs text-[--flag]">pendente</span>
                ) : null}
                <span
                  className="ml-auto font-medium tabular-nums"
                  style={{ color: row.direction === "out" ? "var(--out)" : "var(--in)" }}
                >
                  {row.direction === "out" ? "-" : "+"}
                  {formatCents(row.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
