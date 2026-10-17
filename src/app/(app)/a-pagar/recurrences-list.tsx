"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { CurrencyCode } from "@/lib/money";
import {
  deactivateRecurrence,
  moveRecurrence,
} from "@/lib/actions/recurrences";
import { Money } from "@/components/money";
import { RecurrenceEditDialog } from "@/components/recurrence-edit-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecurrenceFrequency } from "@/lib/recurrence";

export type RecurrenceRow = {
  id: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  frequency: RecurrenceFrequency;
  day_of_month: number | null;
  /** "todo dia 18", "toda sexta", "a cada 3 meses, dia 15"… */
  schedule: string;
  /** Próxima ocorrência (null: já terminou). */
  next_date: string | null;
  account_id: string;
  account_name: string;
  /** Conta do casal ou própria. Da conta "aberta" do outro, só leitura. */
  can_edit: boolean;
};

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string; kind: "income" | "expense"; is_transfer?: boolean; parent_id?: string | null };

// Mesmo desenho dos grupos de A vencer (upcoming-groups.tsx): bloco com a
// data à esquerda, nome e detalhe, valor e o botão cinza à direita.
const pill =
  "flex h-9 shrink-0 items-center rounded-xl bg-(--bg-hover) px-3 text-[13px] font-semibold text-(--text-primary) transition-colors hover:bg-(--primary-light) hover:text-(--primary-hover) disabled:opacity-60";

function dayBlock(date: string | null) {
  if (!date) return { day: "—", label: "" };
  const d = new Date(`${date}T00:00:00`);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

export function RecurrencesList({
  title,
  dot,
  summary,
  rows,
  accounts,
  categories,
  currency = "USD",
  emptyMessage = "Nenhuma recorrência cadastrada.",
}: {
  title: string;
  /** Cor da bolinha do título. */
  dot: string;
  /** Texto ao lado do título (quantas e quanto). */
  summary?: ReactNode;
  rows: RecurrenceRow[];
  /** Contas pra onde dá pra mover: a do casal e as próprias. */
  accounts: AccountOption[];
  categories: CategoryOption[];
  currency?: CurrencyCode;
  emptyMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Uma recorrência por vez fica com o seletor de destino aberto, na
  // própria linha — a pergunta fica ao lado do que vai mudar.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
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

  return (
    <section
      className="rounded-[20px] bg-(--bg-surface) p-5 md:p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <h2 className="text-card-title">{title}</h2>
        {summary ? <span className="text-[13px] font-semibold text-(--text-muted)">{summary}</span> : null}
      </div>

      {rows.length === 0 ? (
        <p className="py-3 text-sm text-(--text-muted)">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => {
            const { day, label } = dayBlock(row.next_date);
            const out = row.direction === "out";
            const canMove = accounts.some((a) => a.id !== row.account_id);
            return (
              <div
                key={row.id}
                className="-mx-3 flex flex-col rounded-[14px] px-3 transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex min-h-[64px] items-center gap-3 md:gap-4">
                  <div className="w-11 shrink-0 text-center" title="Próxima vez">
                    <div className="text-[18px] leading-none font-extrabold">{day}</div>
                    <div className="text-[11px] font-semibold text-(--text-light)">{label}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-(--text-primary)">{row.description}</p>
                    <p className="truncate text-xs text-(--text-muted)">
                      {row.account_name} · {row.schedule}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-right text-[14px] font-bold tabular-nums md:text-[15px]"
                    style={{ color: out ? "var(--expense-dark)" : "var(--income-dark)" }}
                  >
                    {out ? "−" : "+"}
                    <Money cents={row.amount_cents} currency={currency} />
                  </span>
                  {row.can_edit ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        className={`${pill} max-sm:hidden`}
                        onClick={() => {
                          setFeedback(null);
                          setEditingId(row.id);
                        }}
                      >
                        Editar
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={isPending}
                            aria-label={`Mais opções de ${row.description}`}
                            className={`${pill} w-9 justify-center px-0`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem
                            className="sm:hidden"
                            onSelect={() => {
                              setFeedback(null);
                              setEditingId(row.id);
                            }}
                          >
                            Editar
                          </DropdownMenuItem>
                          {canMove ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setFeedback(null);
                                setTarget("");
                                setMovingId(row.id);
                              }}
                            >
                              Mover pra outra conta
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            className="text-(--expense-dark)"
                            onSelect={() =>
                              startTransition(async () => {
                                await deactivateRecurrence(row.id);
                                router.refresh();
                              })
                            }
                          >
                            Desativar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <span className="w-14 shrink-0 text-right text-xs text-(--text-muted)" title="Conta pessoal de outra pessoa">
                      Só leitura
                    </span>
                  )}
                </div>

                {movingId === row.id ? (
                  <div className="mb-3 ml-14 flex flex-wrap items-center gap-2 md:ml-[60px]">
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      className="h-9 rounded-xl border border-(--border-primary) bg-(--bg-surface) px-3 text-[13px]"
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
                    <button
                      type="button"
                      disabled={isPending || !target}
                      onClick={() => confirmMove(row)}
                      className="flex h-9 items-center rounded-xl bg-(--primary) px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      Mover
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setMovingId(null);
                        setTarget("");
                      }}
                      className="h-9 px-2 text-[13px] font-semibold text-(--text-muted) hover:text-(--text-primary)"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : null}

                {feedback?.id === row.id ? (
                  <p
                    className="mb-3 ml-14 text-xs md:ml-[60px]"
                    style={{ color: feedback.error ? "var(--expense)" : "var(--text-secondary)" }}
                  >
                    {feedback.text}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {editingId ? (
        <RecurrenceEditDialog
          recurrenceId={editingId}
          accounts={accounts}
          categories={categories}
          currency={currency}
          open
          onOpenChange={(next) => !next && setEditingId(null)}
          onSaved={(text) => setFeedback({ id: editingId, text, error: false })}
        />
      ) : null}
    </section>
  );
}
