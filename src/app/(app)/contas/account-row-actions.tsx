"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { archiveAccount, deleteAccount, unarchiveAccount } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { AccountForm } from "./account-form";

type EditableAccount = NonNullable<React.ComponentProps<typeof AccountForm>["account"]>;

// Menu ⋯ da conta: editar e arquivar ficam guardados aqui, em vez de
// botões à mostra em toda linha.
export function AccountRowActions({
  account,
  isArchived,
  paymentAccounts,
}: {
  account: EditableAccount;
  isArchived: boolean;
  paymentAccounts: { id: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleArchive() {
    startTransition(async () => {
      if (isArchived) await unarchiveAccount(account.id);
      else await archiveAccount(account.id);
      router.refresh();
    });
  }

  function onDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteAccount(account.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Opções de ${account.name}`}
            className="shrink-0 text-(--text-light) hover:text-(--text-secondary)"
          >
            <Ellipsis className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isArchived ? (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={toggleArchive}>
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {isArchived ? "Reativar" : "Arquivar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="text-(--expense-dark) focus:text-(--expense-dark)"
          >
            <Trash2 className="h-4 w-4" />
            Excluir conta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta some de vez, junto com as recorrências que lançariam nela. Só dá pra excluir conta
              sem lançamentos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-(--expense-dark)">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                // Fica aberto até saber se deu certo, pra mostrar o motivo se não der.
                e.preventDefault();
                onDelete();
              }}
              className="bg-(--expense) hover:bg-(--expense-dark)"
            >
              {isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AccountForm
        account={account}
        paymentAccounts={paymentAccounts}
        trigger={null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
