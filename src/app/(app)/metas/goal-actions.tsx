"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { addGoalDeposit, deleteGoal, deleteGoalDeposit, updateGoal } from "@/lib/actions/goals";
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
  deposits: { id: string; amount_cents: number; date: string; note: string | null }[];
};

const label = "mb-2 block text-[13px] font-semibold text-(--text-body)";
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** "+ Guardar valor" (juntar) ou "+ Registrar pagamento" (dívida manual). */
export function DepositButton({ goal, today }: { goal: GoalActionData; today: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isDebt = goal.kind === "debt";

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
      setOpen(false);
      setAmount("");
      setNote("");
      setWithdraw(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-(--primary-light) px-3.5 text-[13px] font-semibold text-(--primary) transition-opacity hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> {isDebt ? "Registrar pagamento" : "Guardar valor"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{isDebt ? "Pagamento" : "Guardar"} · {goal.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {!isDebt ? (
              <div className="flex gap-1 rounded-[14px] bg-(--bg-track) p-1">
                {([false, true] as const).map((w) => (
                  <button
                    key={String(w)}
                    type="button"
                    aria-pressed={withdraw === w}
                    onClick={() => setWithdraw(w)}
                    className={`h-10 flex-1 rounded-[11px] text-[13px] font-semibold ${
                      withdraw === w ? "bg-(--bg-surface) text-(--text-primary) shadow-(--shadow-sm)" : "text-(--text-muted)"
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
                      <span className="min-w-0 flex-1 truncate text-[13px] text-(--text-secondary)">{d.note ?? ""}</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: d.amount_cents < 0 ? "var(--expense-dark)" : undefined }}>
                        {d.amount_cents < 0 ? "−" : "+"}
                        {formatCents(Math.abs(d.amount_cents), currency)}
                      </span>
                      <button
                        type="button"
                        aria-label="Apagar este valor"
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
