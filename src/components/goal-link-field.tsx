"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Target } from "lucide-react";
import {
  goalLinksForTransaction,
  linkTransactionToGoal,
  unlinkTransactionFromGoal,
  type TransactionGoalLinks,
} from "@/lib/actions/goals";

// Dentro da caixa de editar lançamento: marcar que este pagamento conta
// pra uma meta (ex.: a parcela do empréstimo). Salva na hora, separado do
// "Salvar alterações". Só aparece se houver meta em que ele possa entrar.
export function GoalLinkField({ transactionId }: { transactionId: string }) {
  const [data, setData] = useState<TransactionGoalLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    goalLinksForTransaction(transactionId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ options: [], linked: [] }));
    return () => {
      alive = false;
    };
  }, [transactionId]);

  if (!data || data.options.length === 0) return null;
  const linked = new Set(data.linked);

  function toggle(goalId: string) {
    setError(null);
    const on = linked.has(goalId);
    startTransition(async () => {
      const r = on ? await unlinkTransactionFromGoal(goalId, transactionId) : await linkTransactionToGoal(goalId, transactionId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setData((d) =>
        d ? { ...d, linked: on ? d.linked.filter((id) => id !== goalId) : [...d.linked, goalId] } : d,
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-(--text-body)">
        <Target className="h-4 w-4 text-(--primary)" /> Conta pra uma meta?
      </span>
      <div className="flex flex-wrap gap-2">
        {data.options.map((g) => {
          const on = linked.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              disabled={isPending}
              onClick={() => toggle(g.id)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm transition-colors disabled:opacity-60 ${
                on
                  ? "border-(--primary) bg-(--primary-soft) font-semibold text-(--primary-hover)"
                  : "border-(--border-primary) font-medium text-(--text-body) hover:border-(--primary-border)"
              }`}
            >
              {on ? <Check className="h-4 w-4" strokeWidth={2.6} /> : null}
              {g.name}
              <span className="text-xs font-normal text-(--text-muted)">{g.kind === "debt" ? "· pagamento" : "· guardar"}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-(--danger-text)">{error}</p> : null}
    </div>
  );
}
