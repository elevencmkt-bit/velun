"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents, type CurrencyCode } from "@/lib/money";
import {
  deactivateRecurrence,
  moveRecurrence,
} from "@/lib/actions/recurrences";
import { Button } from "@/components/ui/button";

export type RecurrenceRow = {
  id: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  frequency: "monthly" | "weekly" | "yearly";
  day_of_month: number | null;
  account_id: string;
  account_name: string;
  /** Conta do casal ou própria. Da conta "aberta" do outro, só leitura. */
  can_edit: boolean;
};

type AccountOption = { id: string; name: string };

const FREQUENCY_LABELS: Record<RecurrenceRow["frequency"], string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
};

export function RecurrencesList({
  rows,
  accounts,
  currency = "USD",
  emptyMessage = "Nenhuma recorrência cadastrada.",
}: {
  rows: RecurrenceRow[];
  /** Contas pra onde dá pra mover: a do casal e as próprias. */
  accounts: AccountOption[];
  currency?: CurrencyCode;
  emptyMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Uma recorrência por vez fica com o seletor de destino aberto, na
  // própria linha — a pergunta fica ao lado do que vai mudar.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [feedback, setFeedback] = useState<{
    id: string;
    text: string;
    error: boolean;
  } | null>(null);

  function confirmMove(row: RecurrenceRow) {
    if (!target) return;
    startTransition(async () => {
      const result = await moveRecurrence(row.id, target);
      if (!result.ok) {
        setFeedback({ id: row.id, text: result.error, error: true });
        return;
      }
      const name =
        accounts.find((a) => a.id === target)?.name ?? "a nova conta";
      setFeedback({
        id: row.id,
        error: false,
        text:
          result.moved === 1
            ? `Movida pra ${name}, com 1 ocorrência prevista. O que já foi pago ficou na conta antiga.`
            : `Movida pra ${name}, com ${result.moved} ocorrências previstas. O que já foi pago ficou na conta antiga.`,
      });
      setMovingId(null);
      setTarget("");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-(--text-muted)">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-table-header grid grid-cols-[1fr_auto] gap-3 border-b border-(--border-primary) px-1 pb-1.5 sm:grid-cols-[1fr_84px_64px_96px]">
        <span>Lançamento</span>
        <span className="hidden sm:block">Período</span>
        <span className="hidden sm:block">Dia</span>
        <span className="text-right">Valor</span>
      </div>

      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-(--border-soft) px-1 py-2.5 transition-colors last:border-0 hover:bg-[#F9FAFB] sm:grid-cols-[1fr_84px_64px_96px]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-table-body truncate text-(--text-primary)">
                {row.description}
              </span>
              <span className="truncate text-xs text-(--text-muted)">
                {row.account_name}
                {/* No celular período e dia saem das colunas e vêm aqui. */}
                <span className="sm:hidden">
                  {" · "}
                  {FREQUENCY_LABELS[row.frequency]}
                  {row.frequency === "monthly" && row.day_of_month ? `, dia ${row.day_of_month}` : ""}
                </span>
              </span>
              {movingId === row.id ? (
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-7 rounded-md border border-(--border-primary) bg-transparent px-2 text-xs"
                    aria-label="Mover para a conta"
                  >
                    <option value="">Mover para…</option>
                    {accounts
                      .filter((a) => a.id !== row.account_id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="xs"
                    disabled={isPending || !target}
                    onClick={() => confirmMove(row)}
                  >
                    {isPending ? "Movendo..." : "Mover"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => {
                      setMovingId(null);
                      setTarget("");
                    }}
                  >
                    Cancelar
                  </Button>
                </span>
              ) : null}
              {feedback?.id === row.id ? (
                <span
                  className="mt-1 text-xs"
                  style={{
                    color: feedback.error
                      ? "var(--expense)"
                      : "var(--text-secondary)",
                  }}
                >
                  {feedback.text}
                </span>
              ) : null}
            </span>
            <span className="text-table-body hidden sm:block">
              {FREQUENCY_LABELS[row.frequency]}
            </span>
            <span className="text-table-body hidden sm:block">
              {row.frequency === "monthly" && row.day_of_month
                ? row.day_of_month
                : "—"}
            </span>
            <span className="flex flex-col items-end gap-1">
              <span
                className="text-right font-semibold tabular-nums"
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
              {row.can_edit ? (
                <span className="flex items-center gap-1">
                  {accounts.some((a) => a.id !== row.account_id) ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        setFeedback(null);
                        setTarget("");
                        setMovingId(movingId === row.id ? null : row.id);
                      }}
                    >
                      Mover
                    </Button>
                  ) : null}
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
              ) : (
                <span
                  className="text-xs text-(--text-muted)"
                  title="Conta pessoal de outra pessoa: só leitura"
                >
                  Só leitura
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
