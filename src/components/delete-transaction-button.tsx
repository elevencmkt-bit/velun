"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTransaction, deleteTransferGroup } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
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

export function DeleteTransactionButton({
  transactionId,
  transferGroupId,
}: {
  transactionId: string;
  transferGroupId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isTransfer = Boolean(transferGroupId);

  function onConfirm() {
    startTransition(async () => {
      if (isTransfer && transferGroupId) {
        await deleteTransferGroup(transferGroupId);
      } else {
        await deleteTransaction(transactionId);
      }
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Excluir transação">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {isTransfer ? "transferência" : "transação"}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isTransfer
              ? "As duas pernas da transferência serão removidas. Essa ação não pode ser desfeita."
              : "Essa ação não pode ser desfeita."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            className="bg-(--expense) hover:bg-(--expense-dark)"
          >
            {isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
