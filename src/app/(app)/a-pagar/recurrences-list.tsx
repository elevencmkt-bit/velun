"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { deactivateRecurrence } from "@/lib/actions/recurrences";
import { Button } from "@/components/ui/button";

export type RecurrenceRow = {
  id: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  frequency: "monthly" | "weekly" | "yearly";
  day_of_month: number | null;
};

const FREQUENCY_LABELS: Record<RecurrenceRow["frequency"], string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
};

export function RecurrencesList({
  rows,
  currency = "USD",
  emptyMessage = "Nenhuma recorrência cadastrada.",
}: {
  rows: RecurrenceRow[];
  currency?: CurrencyCode;
  emptyMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="text-sm text-(--text-muted)">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-table-header grid grid-cols-[1fr_84px_64px_96px] gap-3 border-b border-(--border-primary) px-1 pb-1.5">
        <span>Lançamento</span>
        <span>Período</span>
        <span>Dia</span>
        <span className="text-right">Valor</span>
      </div>

      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_84px_64px_96px] items-center gap-3 border-b border-(--border-soft) px-1 py-2.5 transition-colors last:border-0 hover:bg-[#F9FAFB]"
          >
            <span className="text-table-body min-w-0 truncate text-(--text-primary)">
              {row.description}
            </span>
            <span className="text-table-body">{FREQUENCY_LABELS[row.frequency]}</span>
            <span className="text-table-body">
              {row.frequency === "monthly" && row.day_of_month ? row.day_of_month : "—"}
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
              <Button
                size="xs"
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deactivateRecurrence(row.id);
                    router.refresh();
                  })
                }
              >
                Desativar
              </Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
