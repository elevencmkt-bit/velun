"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Sparkles, X } from "lucide-react";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { linkTransactionToGoal } from "@/lib/actions/goals";
import type { GoalSuggestion } from "@/lib/goals";

const KEY = "velun:goal-dismissed";
const listeners = new Set<() => void>();
function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// "Parece pagamento desta meta": lançamento com o mesmo nome e valor
// parecido com os que já foram vinculados. Um clique vincula; o × some com
// a sugestão neste aparelho.
export function GoalSuggestions({
  goalId,
  kind,
  suggestions,
  currency,
}: {
  goalId: string;
  kind: "save" | "debt" | "limit";
  suggestions: GoalSuggestion[];
  currency: CurrencyCode;
}) {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  let dismissed: string[] = [];
  try {
    dismissed = JSON.parse(raw) as string[];
  } catch {
    dismissed = [];
  }
  const shown = suggestions.filter((s) => !dismissed.includes(`${goalId}:${s.id}`));
  if (shown.length === 0) return null;

  function dismiss(id: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...dismissed, `${goalId}:${id}`].slice(-200)));
    } catch {
      // sem localStorage: a sugestão volta ao recarregar
    }
    listeners.forEach((cb) => cb());
  }

  function link(id: string) {
    startTransition(async () => {
      await linkTransactionToGoal(goalId, id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-(--primary-soft) p-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-(--primary-hover)">
        <Sparkles className="h-3.5 w-3.5" />
        {kind === "debt" ? "Parece pagamento desta meta" : "Parece depósito desta meta"}
      </span>
      {shown.map((s) => (
        <div key={s.id} className="flex items-center gap-2.5">
          <span className="w-[42px] shrink-0 text-xs text-(--text-muted)">{s.date.slice(8)}/{s.date.slice(5, 7)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-(--text-body)">
            {s.description} <span className="text-(--text-muted)">· {s.account_name}</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold tabular-nums">{formatCents(s.amount_cents, currency)}</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => link(s.id)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] bg-(--primary) px-2.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            <Link2 className="h-3.5 w-3.5" /> Vincular
          </button>
          <button
            type="button"
            aria-label="Não é desta meta"
            onClick={() => dismiss(s.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-(--text-muted) hover:bg-(--bg-hover)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
