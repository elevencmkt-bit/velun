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
    return <p className="text-sm text-[--ink]/70">Nenhuma recorrência cadastrada.</p>;
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-3 border-b border-[--rule]/60 py-2 text-sm"
        >
          <span className="w-48 truncate">{row.description}</span>
          <span className="w-24 text-[--ink]/60">{FREQUENCY_LABELS[row.frequency]}</span>
          {row.frequency === "monthly" && row.day_of_month ? (
            <span className="w-20 text-[--ink]/60">dia {row.day_of_month}</span>
          ) : (
            <span className="w-20" />
          )}
          <span
            className="ml-auto font-medium tabular-nums"
            style={{ color: row.direction === "out" ? "var(--out)" : "var(--in)" }}
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
