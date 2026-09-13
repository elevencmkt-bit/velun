"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
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

export function RecurrencesList({ rows }: { rows: RecurrenceRow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="text-sm text-[--text-muted]">Nenhuma recorrência cadastrada.</p>;
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex min-h-[50px] items-center gap-3 border-b border-[--border-soft] px-1 transition-colors last:border-0 hover:bg-[#F9FAFB]"
        >
          <span className="text-table-body w-48 truncate text-[--text-primary]">
            {row.description}
          </span>
          <span className="text-table-body w-24">{FREQUENCY_LABELS[row.frequency]}</span>
          {row.frequency === "monthly" && row.day_of_month ? (
            <span className="text-table-body w-20">dia {row.day_of_month}</span>
          ) : (
            <span className="w-20" />
          )}
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
        </div>
      ))}
    </div>
  );
}
