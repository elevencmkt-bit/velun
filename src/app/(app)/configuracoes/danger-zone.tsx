"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAllData, resetTransactionsData } from "@/lib/actions/household";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  return (
    <Card className="border-(--expense)/30">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-card-title">Zona de risco</h2>
          <p className="text-metadata">Essas ações apagam dados de verdade e não podem ser desfeitas.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border-soft) pb-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-(--text-primary)">Apagar transações e recorrências</span>
            <span className="text-metadata">Mantém contas e categorias cadastradas.</span>
          </div>
          <ResetAction
            buttonLabel="Apagar transações"
            title="Apagar todas as transações?"
            description="Todo o histórico de lançamentos e recorrências será removido. Contas e categorias continuam como estão. Essa ação não pode ser desfeita."
            confirmPhrase="EXCLUIR"
            action={resetTransactionsData}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-(--text-primary)">Resetar tudo</span>
            <span className="text-metadata">Apaga transações, recorrências, categorias e contas.</span>
          </div>
          <ResetAction
            buttonLabel="Resetar tudo"
            title="Resetar o household inteiro?"
            description="Transações, recorrências, categorias e contas serão apagadas — o household volta ao estado de conta nova. Login e membros continuam existindo. Essa ação não pode ser desfeita."
            confirmPhrase="EXCLUIR TUDO"
            action={resetAllData}
          />
        </div>
      </CardContent>
    </Card>
  );
}
