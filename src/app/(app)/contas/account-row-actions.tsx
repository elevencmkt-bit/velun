"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2, Undo2, X } from "lucide-react";
import {
  approveAccountDeletion,
  archiveAccount,
  declineAccountDeletion,
  deleteAccount,
  unarchiveAccount,
} from "@/lib/actions/accounts";
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
  needsApproval = false,
  partnerName = null,
  pendingRequest = null,
  editOpen: editOpenProp,
  onEditOpenChange,
}: {
  account: EditableAccount;
  isArchived: boolean;
  paymentAccounts: { id: string; name: string }[];
  /** Conta do casal com mais alguém na casa: excluir vira pedido. */
  needsApproval?: boolean;
  partnerName?: string | null;
  /** Pedido de exclusão aberto pra esta conta. */
  pendingRequest?: { id: string; isMine: boolean } | null;
  /** Quando a linha inteira abre a edição, quem manda no diálogo é ela. */
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
}) {
  const [editOpenState, setEditOpenState] = useState(false);
  const editOpen = editOpenProp ?? editOpenState;
  const setEditOpen = onEditOpenChange ?? setEditOpenState;
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

  function decide(approve: boolean) {
    if (!pendingRequest) return;
    startTransition(async () => {
      const result = approve
        ? await approveAccountDeletion(pendingRequest.id)
        : await declineAccountDeletion(pendingRequest.id);
      if (!result.ok) {
        setDeleteError(result.error ?? "Não deu certo.");
        setDeleteOpen(true);
        return;
      }
      router.refresh();
    });
  }

  const who = partnerName ?? "a outra pessoa da casa";

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
          {pendingRequest ? (
            pendingRequest.isMine ? (
              <DropdownMenuItem onSelect={() => decide(false)}>
                <Undo2 className="h-4 w-4" />
                Cancelar pedido de exclusão
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={() => decide(true)}
                  className="text-(--expense-dark) focus:text-(--expense-dark)"
                >
                  <Trash2 className="h-4 w-4" />
                  Aprovar exclusão
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => decide(false)}>
                  <X className="h-4 w-4" />
                  Recusar exclusão
                </DropdownMenuItem>
              </>
            )
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="text-(--expense-dark) focus:text-(--expense-dark)"
            >
              <Trash2 className="h-4 w-4" />
              {needsApproval ? "Pedir pra excluir" : "Excluir conta"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {needsApproval ? `Pedir pra excluir ${account.name}?` : `Excluir ${account.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {needsApproval
                ? `Conta do casal só sai com o aval dos dois. ${who} recebe o pedido no sino e aprova ou recusa. Só dá pra excluir conta sem lançamentos.`
                : "A conta some de vez, junto com as recorrências que lançariam nela. Só dá pra excluir conta sem lançamentos. Essa ação não pode ser desfeita."}
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
              {isPending ? (needsApproval ? "Enviando…" : "Excluindo…") : needsApproval ? "Pedir" : "Excluir"}
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

// Linha de conta que abre a edição com um clique (ou toque) em qualquer
// lugar dela, como as categorias em Configurações. O ⋯ continua ali pro
// resto (arquivar, excluir). Conta arquivada não edita: só o ⋯.
export function ClickableAccountRow({
  children,
  trailing,
  ...actions
}: React.ComponentProps<typeof AccountRowActions> & {
  /** Nome, tipo, avisos — a parte que abre a edição. */
  children: ReactNode;
  /** Selo e saldo, entre o nome e o ⋯. */
  trailing: ReactNode;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const clickable = !actions.isArchived;
  return (
    <div
      className={`group relative -mx-2 flex min-h-[72px] items-center gap-3 rounded-[14px] px-2 py-3 transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-(--border-soft) last:after:hidden md:gap-3.5 ${
        clickable ? "cursor-pointer hover:bg-(--bg-subtle)" : ""
      }`}
      onClick={(e) => {
        if (!clickable) return;
        // Clique que veio do ⋯ ou do diálogo (pelo portal) não conta.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest("button, a, [role=menu]")) return;
        setEditOpen(true);
      }}
    >
      {clickable ? (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none md:gap-3.5"
          aria-label={`Editar ${actions.account.name}`}
        >
          {children}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-3.5">{children}</div>
      )}
      {trailing}
      <AccountRowActions {...actions} editOpen={editOpen} onEditOpenChange={setEditOpen} />
    </div>
  );
}
