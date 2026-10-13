"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/date-input";
import { amountToCents } from "@/lib/amount-input";
import { formatCents, type CurrencyCode } from "@/lib/money";
import {
  addGoalDeposit,
  deleteGoal,
  deleteGoalDeposit,
  findLinkableTransactions,
  linkTransactionToGoal,
  updateGoal,
  type LinkableTransaction,
} from "@/lib/actions/goals";
import type { GoalKind } from "@/lib/goal-math";

export type GoalActionData = {
  id: string;
  kind: GoalKind;
  name: string;
  target_cents: number | null;
  target_date: string | null;
  tracking: "deposits" | "account";
  owner_id: string | null;
  visibility: "hidden" | "shared";
  mine: boolean;
  deposits: {
    id: string;
    amount_cents: number;
    date: string;
    note: string | null;
    transaction_id: string | null;
    linked: { description: string; account_name: string } | null;
  }[];
};

const label = "mb-2 block text-[13px] font-semibold text-(--text-body)";
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * "+ Guardar valor" (juntar) ou "+ Registrar pagamento" (dívida manual).
 * Dá pra digitar o valor ou escolher um lançamento que já existe — aí o
 * valor e a data vêm dele, sem lançar duas vezes.
 */
export function DepositButton({ goal, today, currency }: { goal: GoalActionData; today: string; currency: CurrencyCode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"type" | "link">("type");
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableTransaction[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const isDebt = goal.kind === "debt";

  function close() {
    setOpen(false);
    setMode("type");
    setAmount("");
    setNote("");
    setQuery("");
    setResults(null);
    setWithdraw(false);
    setError(null);
  }

  function search(text: string) {
    setSearching(true);
    findLinkableTransactions(goal.id, text)
      .then(setResults)
      .catch(() => setError("Não consegui buscar os lançamentos."))
      .finally(() => setSearching(false));
  }

  function onQuery(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search(text), 300);
  }

  function submit() {
    const cents = amountToCents(amount);
    if (cents <= 0) {
      setError("Informe o valor.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await addGoalDeposit({ goalId: goal.id, amountCents: withdraw ? -cents : cents, date, note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function link(tx: LinkableTransaction) {
    setError(null);
    startTransition(async () => {
      const r = await linkTransactionToGoal(goal.id, tx.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  const tab = (on: boolean) =>
    `h-10 flex-1 rounded-[11px] text-[13px] font-semibold ${on ? "bg-(--bg-surface) text-(--text-primary) shadow-(--shadow-sm)" : "text-(--text-muted)"}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-(--primary-light) px-3.5 text-[13px] font-semibold text-(--primary) transition-opacity hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> {isDebt ? "Registrar pagamento" : "Guardar valor"}
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{isDebt ? "Pagamento" : "Guardar"} · {goal.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex gap-1 rounded-[14px] bg-(--bg-track) p-1">
              <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")} className={tab(mode === "type")}>
                Digitar valor
              </button>
              <button
                type="button"
                aria-pressed={mode === "link"}
                onClick={() => {
                  setMode("link");
                  if (results === null) search("");
                }}
                className={tab(mode === "link")}
              >
                <Link2 className="mr-1.5 inline h-3.5 w-3.5" />
                {isDebt ? "Pagamento já lançado" : "Lançamento já feito"}
              </button>
            </div>

            {mode === "type" ? (
              <>
                {!isDebt ? (
                  <div className="flex gap-2">
                    {([false, true] as const).map((w) => (
                      <button
                        key={String(w)}
                        type="button"
                        aria-pressed={withdraw === w}
                        onClick={() => setWithdraw(w)}
                        className={`inline-flex h-9 items-center rounded-full border-[1.5px] px-3.5 text-[13px] ${
                          withdraw === w ? "border-(--primary) bg-(--primary-soft) font-semibold text-(--primary-hover)" : "border-(--border-primary) font-medium text-(--text-body)"
                        }`}
                      >
                        {w ? "Tirar da meta" : "Guardar"}
                      </button>
                    ))}
                  </div>
                ) : null}
                <label>
                  <span className={label}>Valor</span>
                  <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="h-12 rounded-[14px] text-[17px] font-bold" />
                </label>
                <div>
                  <span className={label}>Data</span>
                  <DateInput aria-label="Data" defaultValue={today} onChange={(v) => setDate(v || today)} className="h-12 rounded-[14px]" />
                </div>
                <label>
                  <span className={label}>
                    Observação <span className="font-normal text-(--text-light)">(opcional)</span>
                  </span>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="h-12 rounded-[14px]" />
                </label>
                {error ? <p className="text-sm text-(--danger-text)">{error}</p> : null}
                <Button onClick={submit} disabled={isPending} className="h-12 rounded-[14px] text-[15px] font-bold">
                  {isPending ? "Salvando…" : withdraw ? "Tirar" : isDebt ? "Registrar" : "Guardar"}
                </Button>
              </>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder="Buscar pelo nome ou valor"
                    className="h-12 rounded-[14px] pl-10"
                  />
                </div>
                <p className="-mt-2 px-0.5 text-xs text-(--text-muted)">
                  Últimos 6 meses{goal.owner_id === null ? ", contas do casal" : ""}. O valor e a data vêm do lançamento.
                </p>
                <div className="flex max-h-[340px] flex-col overflow-y-auto rounded-[14px] bg-(--bg-subtle) px-2">
                  {results === null || searching ? (
                    <p className="py-6 text-center text-sm text-(--text-muted)">Buscando…</p>
                  ) : results.length === 0 ? (
                    <p className="py-6 text-center text-sm text-(--text-muted)">Nenhum lançamento encontrado.</p>
                  ) : (
                    results.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => link(t)}
                        className="flex min-h-[56px] items-center gap-3 rounded-[10px] border-b border-(--border-soft) px-2 text-left transition-colors last:border-0 hover:bg-(--bg-hover) disabled:opacity-60"
                      >
                        <span className="w-[46px] shrink-0 text-xs text-(--text-muted)">{brDate(t.date).slice(0, 5)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-(--text-primary)">{t.description}</span>
                          <span className="block truncate text-xs text-(--text-muted)">{t.account_name}</span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: t.direction === "in" ? "var(--income-dark)" : undefined }}>
                          {t.direction === "in" ? "+" : "−"}
                          {formatCents(t.amount_cents, currency)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {error ? <p className="text-sm text-(--danger-text)">{error}</p> : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Editar a meta, ver o histórico de valores e apagar. */
export function EditGoalButton({ goal, currency }: { goal: GoalActionData; currency: CurrencyCode }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(goal.target_cents ? (goal.target_cents / 100).toFixed(2).replace(".", ",") : "");
  const [date, setDate] = useState(goal.target_date ?? "");
  const [shared, setShared] = useState(goal.visibility === "shared");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateGoal(goal.id, {
        name,
        targetCents: amountToCents(target) || null,
        targetDate: date || null,
        shared,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function removeDeposit(id: string) {
    startTransition(async () => {
      const r = await deleteGoalDeposit(id);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteGoal(goal.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmDelete(false);
        return;
      }
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Editar ${goal.name}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-(--bg-track) px-3.5 text-[13px] font-semibold text-(--text-body) transition-colors hover:bg-(--bg-hover)"
      >
        <Pencil className="h-3.5 w-3.5" /> {goal.deposits.length > 0 ? "Editar e histórico" : "Editar"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Editar meta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {goal.kind !== "limit" ? (
              <label>
                <span className={label}>Nome</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-12 rounded-[14px]" />
              </label>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {goal.kind !== "debt" ? (
                <label>
                  <span className={label}>{goal.kind === "limit" ? "Limite por mês" : "Quanto juntar"}</span>
                  <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="h-12 rounded-[14px] font-bold" />
                </label>
              ) : null}
              {goal.kind !== "limit" ? (
                <div>
                  <span className={label}>Até quando</span>
                  <DateInput aria-label="Até quando" defaultValue={goal.target_date ?? ""} onChange={setDate} className="h-12 rounded-[14px]" />
                </div>
              ) : null}
            </div>
            {goal.mine ? (
              <label className="flex items-center gap-2.5 text-sm text-(--text-body)">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-(--primary)" />
                Quem divide a casa pode ver
              </label>
            ) : null}

            {goal.deposits.length > 0 ? (
              <div>
                <span className={label}>{goal.kind === "debt" ? "Pagamentos" : "Valores guardados"}</span>
                <div className="flex max-h-[220px] flex-col overflow-y-auto rounded-[14px] bg-(--bg-subtle) px-3">
                  {goal.deposits.map((d) => (
                    <div key={d.id} className="flex min-h-12 items-center gap-3 border-b border-(--border-soft) last:border-0">
                      <span className="w-[76px] shrink-0 text-xs text-(--text-muted)">{brDate(d.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-(--text-secondary)">
                        {d.transaction_id ? (
                          <span className="inline-flex max-w-full items-center gap-1.5" title="Vinculado a um lançamento">
                            <Link2 className="h-3.5 w-3.5 shrink-0 text-(--primary)" />
                            <span className="truncate">{d.linked ? `${d.linked.description} · ${d.linked.account_name}` : "Lançamento vinculado"}</span>
                          </span>
                        ) : (
                          (d.note ?? "")
                        )}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: d.amount_cents < 0 ? "var(--expense-dark)" : undefined }}>
                        {d.amount_cents < 0 ? "−" : "+"}
                        {formatCents(Math.abs(d.amount_cents), currency)}
                      </span>
                      <button
                        type="button"
                        aria-label={d.transaction_id ? "Desvincular este lançamento" : "Apagar este valor"}
                        title={d.transaction_id ? "Desvincular (o lançamento continua)" : "Apagar"}
                        disabled={isPending}
                        onClick={() => removeDeposit(d.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-[9px] text-(--text-light) hover:bg-(--bg-hover) hover:text-(--danger-text)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-(--danger-text)">{error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2 text-[13px] font-semibold text-(--danger-text) hover:bg-(--danger-soft)">
                <Trash2 className="h-4 w-4" /> Apagar meta
              </button>
              <Button onClick={save} disabled={isPending} className="h-11 rounded-[14px] px-6 font-bold">
                {isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar &ldquo;{goal.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              A meta e os valores registrados nela somem. Lançamentos e contas não mudam. Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="bg-(--expense) hover:bg-(--expense-dark)"
            >
              {isPending ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
