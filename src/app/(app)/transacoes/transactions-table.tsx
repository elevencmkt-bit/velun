"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyCode } from "@/lib/money";
import {
  MUTED_CATEGORY_COLOR,
  type CategoryColorPair,
} from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { Check, Lock } from "lucide-react";
import {
  bulkMarkPaid,
  bulkUpdateCategory,
  markTransactionPaid,
  updateTransactionCategory,
} from "@/lib/actions/transactions";
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
import { Money } from "@/components/money";

const NO_CATEGORY = "__none__";

// "Hoje", "Ontem", ou "Terça, 30 de setembro" — como se fala da data,
// não como ela é guardada. O ano só aparece quando não é o atual.
function formatDayHeading(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";

  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
  // "terça-feira, 30 de setembro" → "Terça, 30 de setembro"
  const short = label.replace("-feira", "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function TransactionsTable({
  rows,
  accounts,
  categories,
  categoryColors,
  categoryIcons,
  currency = "USD",
  selectionMode = false,
}: {
  rows: TransactionRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  categoryColors: Record<string, CategoryColorPair>;
  categoryIcons: Record<string, string | null>;
  currency?: CurrencyCode;
  selectionMode?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [editingRow, setEditingRow] = useState<TransactionRow | null>(null);
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

  function onRowClick(row: TransactionRow) {
    if (!row.can_edit) return;
    if (selectionMode) {
      toggle(row.id);
      return;
    }
    if (!row.transfer_group_id) setEditingRow(row);
  }

  const selectedPendingIds = rows
    .filter((r) => selected.has(r.id) && r.status === "pending")
    .map((r) => r.id);

  function applyBulkConfirm() {
    startTransition(async () => {
      await bulkMarkPaid(selectedPendingIds);
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyBulkCategory() {
    const categoryId =
      bulkCategoryId === NO_CATEGORY ? null : bulkCategoryId || null;
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
          <span className="text-sm font-medium text-(--text-primary)">
            {selected.size} selecionada(s)
          </span>
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
          {selectedPendingIds.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={applyBulkConfirm}
            >
              <Check className="h-3.5 w-3.5" /> Confirmar{" "}
              {selectedPendingIds.length}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      ) : null}

      {groups.map(([date, dayRows]) => {
        const editableDayIds = dayRows
          .filter((r) => r.can_edit)
          .map((r) => r.id);
        const allSelected =
          editableDayIds.length > 0 &&
          editableDayIds.every((id) => selected.has(id));
        const dayNet = dayRows.reduce(
          (sum, r) =>
            sum + (r.direction === "in" ? r.amount_cents : -r.amount_cents),
          0,
        );

        return (
          <div key={date} className="flex flex-col gap-1">
            <div className="flex items-center gap-3 py-1.5">
              {selectionMode ? (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    toggleAll(editableDayIds, checked === true)
                  }
                />
              ) : null}
              <span className="shrink-0 text-[12.5px] font-semibold text-(--text-secondary)">
                {formatDayHeading(date)}
              </span>
              <span
                className="h-px flex-1"
                style={{ background: "var(--border-primary)" }}
              />
              <span
                className="shrink-0 text-xs font-bold tabular-nums"
                style={{
                  color: dayNet < 0 ? "var(--expense)" : "var(--income)",
                }}
              >
                {dayNet < 0 ? "-" : "+"}
                <Money cents={Math.abs(dayNet)} currency={currency} />
              </span>
            </div>
            {dayRows.map((row) => {
              const CategoryIcon = getCategoryIcon(
                row.category_name,
                row.direction,
                row.category_name ? categoryIcons[row.category_name] : null,
              );
              const iconColors = row.category_name
                ? (categoryColors[row.category_name] ?? MUTED_CATEGORY_COLOR)
                : MUTED_CATEGORY_COLOR;

              // Linha calma, como no Organizze: o que é, de onde e quanto.
              // Categoria e situação viram texto discreto na segunda linha
              // — antes eram uma pílula colorida e um selo vermelho
              // disputando atenção com o valor. Trocar a categoria rápido
              // continua no computador (seletor discreto à direita); no
              // celular, tocar na linha abre a edição.
              const status = row.is_overdue
                ? { label: "Atrasado", color: "var(--expense-dark)" }
                : row.status === "pending"
                  ? { label: "Pendente", color: "var(--warning-dark)" }
                  : null;

              return (
                <div
                  key={row.id}
                  role={row.can_edit ? "button" : undefined}
                  tabIndex={row.can_edit ? 0 : undefined}
                  onClick={() => onRowClick(row)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  className={`group flex min-h-[60px] items-center gap-3 rounded-xl px-2 outline-none transition-colors focus-visible:bg-(--bg-subtle) ${
                    row.can_edit ? "cursor-pointer hover:bg-(--bg-subtle)" : ""
                  }`}
                >
                  {selectionMode ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(row.id)}
                        disabled={!row.can_edit}
                        onCheckedChange={() => toggle(row.id)}
                      />
                    </span>
                  ) : null}

                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: iconColors.bg, color: iconColors.fg }}
                  >
                    <CategoryIcon className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-(--text-primary)">
                      {row.description}
                    </p>
                    <p className="truncate text-xs text-(--text-muted)">
                      {/* A categoria só aparece aqui no celular; no
                          computador ela tem o seletor à direita. */}
                      <span className="md:hidden">
                        {row.category_name ?? "Sem categoria"} ·{" "}
                      </span>
                      {row.account_name}
                      {row.installment ? ` · ${row.installment}` : ""}
                      {status ? (
                        <span
                          style={{ color: status.color }}
                          className="font-medium"
                        >
                          {" · "}
                          {status.label}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  {row.can_edit ? (
                    <span
                      className="hidden w-40 shrink-0 md:block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Select
                        value={row.category_id ?? NO_CATEGORY}
                        onValueChange={(value) => {
                          const categoryId =
                            value === NO_CATEGORY ? null : value;
                          startTransition(async () => {
                            await updateTransactionCategory(row.id, categoryId);
                            router.refresh();
                          });
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-full justify-between gap-1.5 rounded-lg border-transparent bg-transparent px-2.5 text-[12.5px] font-medium text-(--text-secondary) shadow-none hover:border-(--border-primary) hover:bg-white"
                          aria-label="Categoria"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background: row.category_name
                                  ? iconColors.fg
                                  : "var(--text-light)",
                              }}
                            />
                            <SelectValue placeholder="Sem categoria" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATEGORY}>
                            Sem categoria
                          </SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  ) : (
                    <span className="hidden w-40 shrink-0 truncate px-2.5 text-[12.5px] text-(--text-secondary) md:block">
                      {row.category_name ?? "Sem categoria"}
                    </span>
                  )}

                  <span
                    className="shrink-0 text-right text-[14px] font-semibold tabular-nums md:w-28"
                    style={{
                      color:
                        row.direction === "out"
                          ? "var(--table-amount-out)"
                          : "var(--table-amount-in)",
                    }}
                  >
                    {row.direction === "out" ? "-" : "+"}
                    <Money cents={row.amount_cents} currency={currency} />
                  </span>

                  {/* Ações. Confirmar aparece sempre que há o que confirmar
                      — é a ação do dia a dia. Excluir fica pro passar do
                      mouse no computador, e dentro da edição no celular. */}
                  <span
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.can_edit ? (
                      <>
                        {row.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isPending}
                            aria-label="Marcar como confirmado"
                            title="Marcar como confirmado"
                            className="text-(--income-dark) hover:bg-(--income-soft) hover:text-(--income-dark)"
                            onClick={() =>
                              startTransition(async () => {
                                await markTransactionPaid(row.id);
                                router.refresh();
                              })
                            }
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="hidden h-7 w-7 md:block" />
                        )}
                        <span className="hidden opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:block">
                          <DeleteTransactionButton
                            transactionId={row.id}
                            transferGroupId={row.transfer_group_id}
                          />
                        </span>
                      </>
                    ) : (
                      <span
                        className="flex h-7 w-7 items-center justify-center text-(--text-light) md:w-[60px]"
                        title="Conta pessoal de outra pessoa: só leitura"
                        aria-label="Só leitura"
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {editingRow ? (
        <EditTransactionDialog
          key={editingRow.id}
          open
          onOpenChange={(next) => {
            if (!next) setEditingRow(null);
          }}
          showTrigger={false}
          transaction={{
            id: editingRow.id,
            date: editingRow.date,
            account_id: editingRow.account_id,
            category_id: editingRow.category_id,
            direction: editingRow.direction,
            amount_cents: editingRow.amount_cents,
            description: editingRow.description,
            notes: editingRow.notes,
            bank_description: editingRow.bank_description,
            status: editingRow.status,
            recurrence_id: editingRow.recurrence_id,
          }}
          accounts={accounts}
          categories={categories}
        />
      ) : null}
    </div>
  );
}
