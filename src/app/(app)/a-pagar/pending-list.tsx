"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
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
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function PendingList({
  rows,
  categoryColors,
}: {
  rows: PendingRow[];
  categoryColors: Record<string, CategoryColorPair>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">Nenhuma conta pendente nos próximos 30 dias.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 transition-colors last:border-0 hover:bg-[#F9FAFB]"
        >
          <span className="text-table-body w-16">{formatDate(row.date)}</span>
          {row.is_overdue ? (
            <span
              className="inline-flex h-[26px] items-center rounded-[6px] px-2 text-[11px] font-medium"
              style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning-dark)" }}
            >
              Atrasada
            </span>
          ) : null}
          <span className="text-table-body w-48 truncate text-(--text-primary)">
            {row.description}
          </span>
          <span className="text-table-body w-28">{row.account_name}</span>
          <span className="w-32">
            <CategoryBadge
              name={row.category_name ?? ""}
              kind={row.direction === "in" ? "income" : "expense"}
              color={row.category_name ? categoryColors[row.category_name] : undefined}
            />
          </span>
          <span
            className="ml-auto text-right font-semibold tabular-nums"
            style={{
              color: row.direction === "out" ? "var(--table-amount-out)" : "var(--table-amount-in)",
            }}
          >
            {row.direction === "out" ? "-" : "+"}
            {formatCents(row.amount_cents)}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await markTransactionPaid(row.id);
                router.refresh();
              })
            }
          >
            Marcar como paga
          </Button>
        </div>
      ))}
    </div>
  );
}
