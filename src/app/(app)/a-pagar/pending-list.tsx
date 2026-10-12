"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { markTransactionPaid } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/components/category-badge";
import type { CategoryColorPair } from "@/lib/category-colors";

export type PendingRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  account_name: string;
  category_name: string | null;
  is_overdue: boolean;
  /** Conta do casal ou própria. Da conta "aberta" do outro, só leitura. */
  can_edit: boolean;
};

const PAGE_SIZE = 5;

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function PendingList({
  rows,
  categoryColors,
  kind,
  currency = "USD",
}: {
  rows: PendingRow[];
  categoryColors: Record<string, CategoryColorPair>;
  kind: "pay" | "receive";
  currency?: CurrencyCode;
}) {
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(0);
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">
        {kind === "pay" ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"} nos próximos 30
        dias.
      </p>
    );
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const currentPage = Math.min(page, totalPages - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-table-header grid grid-cols-[1fr_auto] gap-3 border-b border-(--border-primary) px-1 pb-1.5 sm:grid-cols-[1fr_120px_84px_100px]">
        <span>Lançamento</span>
        <span className="hidden sm:block">Categoria</span>
        <span className="hidden sm:block">Data</span>
        <span className="text-right">Valor</span>
      </div>

      <div className="flex min-h-[250px] flex-col">
        {visible.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-(--border-soft) px-1 py-2.5 transition-colors last:border-0 hover:bg-[#F9FAFB] sm:grid-cols-[1fr_120px_84px_100px]"
          >
            {/* No celular a data desce pra baixo do nome e a categoria some:
                sobram duas colunas, o que é e quanto. */}
            <span className="flex min-w-0 flex-col">
              <span className="text-table-body truncate text-(--text-primary)">{row.description}</span>
              <span
                className="text-xs sm:hidden"
                style={{ color: row.is_overdue ? "var(--warning-dark)" : "var(--text-muted)" }}
              >
                {formatDate(row.date)}
                {row.is_overdue ? " · atrasada" : ""}
              </span>
            </span>
            <span className="hidden min-w-0 sm:block">
              <CategoryBadge
                name={row.category_name ?? ""}
                color={row.category_name ? categoryColors[row.category_name] : undefined}
              />
            </span>
            <span className="hidden flex-col sm:flex">
              <span
                className="text-table-body font-medium"
                style={{ color: row.is_overdue ? "var(--warning-dark)" : undefined }}
              >
                {formatDate(row.date)}
              </span>
              {row.is_overdue ? (
                <span className="text-[10px] font-semibold" style={{ color: "var(--warning-dark)" }}>
                  Atrasada
                </span>
              ) : null}
            </span>
            <span className="flex flex-col items-end gap-1">
              <span
                className="text-right font-semibold tabular-nums"
                style={{
                  color: row.direction === "out" ? "var(--table-amount-out)" : "var(--table-amount-in)",
                }}
              >
                {row.direction === "out" ? "-" : "+"}
                {formatCents(row.amount_cents, currency)}
              </span>
              {row.can_edit ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await markTransactionPaid(row.id);
                      router.refresh();
                    })
                  }
                >
                  {kind === "pay" ? "Marcar paga" : "Marcar recebida"}
                </Button>
              ) : (
                <span className="text-xs text-(--text-muted)" title="Conta pessoal de outra pessoa: só leitura">
                  Só leitura
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <span className="text-metadata">
            Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
