"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAllData, resetTransactionsData } from "@/lib/actions/household";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ResetAction({
  title,
  description,
  buttonLabel,
  confirmPhrase,
  action,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  confirmPhrase: string;
  action: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const canConfirm = typed.trim() === confirmPhrase;

  function onConfirm() {
    startTransition(async () => {
      await action();
      setTyped("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTyped(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-(--expense) text-(--expense) hover:bg-(--expense-soft)">
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-phrase">
            Digite <span className="font-semibold text-(--text-primary)">{confirmPhrase}</span> para
            confirmar
          </Label>
          <Input
            id="confirm-phrase"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || isPending}
            onClick={onConfirm}
            className="bg-(--expense) hover:bg-(--expense-dark)"
          >
            {isPending ? "Apagando..." : buttonLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DangerZone() {
  const [open, setOpen] = useState(false);
  // Fechada por padrão e só com contorno: é o que menos se usa na página.
  return (
    <section className="rounded-[20px] border border-(--border-primary)">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left md:px-6"
      >
        <TriangleAlert className="h-[18px] w-[18px] shrink-0 text-(--expense-dark)" />
        <span className="text-sm font-semibold text-(--text-primary)">Zona de risco</span>
        <span className="truncate text-[13px] text-(--text-light) max-sm:hidden">
          Apagar transações ou começar do zero
        </span>
        <ChevronDown
          className={`ml-auto h-[18px] w-[18px] shrink-0 text-(--text-muted) transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="flex flex-col px-5 pb-5 md:px-6">
          <p className="text-metadata pb-3">Essas ações apagam dados de verdade e não podem ser desfeitas.</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border-soft) py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-(--text-primary)">Apagar transações e recorrências</span>
              <span className="text-metadata">Zera o saldo inicial de contas e cartões. Mantém o cadastro deles e as categorias.</span>
            </div>
            <ResetAction
              buttonLabel="Apagar transações"
              title="Apagar todas as transações?"
              description="Todo o histórico de lançamentos, recorrências e importações será removido, e o saldo inicial de contas e cartões volta a zero. O cadastro das contas e cartões (nome, limite, fechamento e vencimento) e as categorias continuam. Essa ação não pode ser desfeita."
              confirmPhrase="EXCLUIR"
              action={resetTransactionsData}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border-soft) pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-(--text-primary)">Resetar tudo</span>
              <span className="text-metadata">Apaga transações, recorrências, categorias e contas.</span>
            </div>
            <ResetAction
              buttonLabel="Resetar tudo"
              title="Apagar todos os dados da casa?"
              description="Transações, recorrências, categorias e contas serão apagadas — a casa volta a ficar como nova. Login e membros continuam existindo. Essa ação não pode ser desfeita."
              confirmPhrase="EXCLUIR TUDO"
              action={resetAllData}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
