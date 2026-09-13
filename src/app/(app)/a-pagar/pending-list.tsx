"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { markTransactionPaid } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "@/components/category-badge";

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
  categoryColors: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[--ink]/70">Nenhuma conta pendente nos próximos 30 dias.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-3 border-b border-[--rule]/60 py-2 text-sm"
        >
          <span className="w-16 text-[--ink]/60">{formatDate(row.date)}</span>
          {row.is_overdue ? (
            <Badge style={{ backgroundColor: "var(--flag)", color: "white" }}>Atrasada</Badge>
          ) : null}
          <span className="w-48 truncate">{row.description}</span>
          <span className="w-28 text-[--ink]/60">{row.account_name}</span>
          <span className="w-32">
            <CategoryBadge
              name={row.category_name ?? ""}
              kind={row.direction === "in" ? "income" : "expense"}
              color={row.category_name ? categoryColors[row.category_name] : undefined}
            />
          </span>
          <span
            className="ml-auto font-semibold tabular-nums"
            style={{ color: row.direction === "out" ? "var(--out)" : "var(--in)" }}
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
