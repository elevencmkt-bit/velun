"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import type { CurrencyCode } from "@/lib/money";
import { Money } from "@/components/money";
import { deleteTransaction, keepBankPending } from "@/lib/actions/transactions";

export type StalePendingRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  direction: "in" | "out";
  account_name: string;
};

function br(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Pendente do banco que não apareceu lançado depois de uma semana.
 * Posto e hotel reservam um valor que às vezes nunca é cobrado: o
 * pendente some do app e ficaria no Velun pra sempre, tirando do saldo.
 */
export function StalePending({ rows, currency }: { rows: StalePendingRow[]; currency: CurrencyCode }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  if (rows.length === 0) return null;

  function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      try {
        const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
        if (res && res.ok === false) setError(res.error ?? "Não deu pra salvar agora.");
        else router.refresh();
      } catch {
        setError("Não deu pra salvar agora. Tente de novo.");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="rounded-[20px] bg-(--warning-soft) p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-(--bg-surface) text-(--warning-dark)">
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-(--text-primary)">
            {rows.length === 1 ? "Pendente que não lançou" : `${rows.length} pendentes que não lançaram`}
          </h2>
          <p className="mt-0.5 text-[13px] text-(--text-secondary)">
            Estavam pendentes no banco há mais de uma semana e não apareceram lançados. Pode ter sido só uma reserva
            (posto, hotel). Confira no app: se sumiu de lá, apague; se aconteceu, mantenha.
          </p>
          <div className="mt-3 flex flex-col">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-(--border-soft) py-2.5">
                <span className="w-11 shrink-0 text-[13px] text-(--text-muted) tabular-nums">{br(r.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-(--text-primary)">{r.description}</span>
                  <span className="block text-xs text-(--text-muted)">{r.account_name}</span>
                </span>
                <span
                  className="shrink-0 text-[14px] font-bold tabular-nums"
                  style={{ color: r.direction === "out" ? "var(--expense-dark)" : "var(--income-dark)" }}
                >
                  {r.direction === "out" ? "−" : "+"}
                  <Money cents={r.amount_cents} currency={currency} />
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, () => keepBankPending(r.id))}
                    className="h-8 rounded-[10px] bg-(--bg-surface) px-3 text-[13px] font-semibold text-(--text-primary) hover:bg-(--bg-hover) disabled:opacity-60"
                  >
                    Manter
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, () => deleteTransaction(r.id))}
                    className="h-8 rounded-[10px] px-3 text-[13px] font-semibold text-(--expense-dark) hover:bg-(--bg-surface) disabled:opacity-60"
                  >
                    Apagar
                  </button>
                </span>
              </div>
            ))}
          </div>
          {error ? <p className="mt-2 text-xs text-(--expense-dark)">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
