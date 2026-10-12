"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Pencil } from "lucide-react";
import { archiveAccount, unarchiveAccount } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleArchive() {
    startTransition(async () => {
      if (isArchived) await unarchiveAccount(account.id);
      else await archiveAccount(account.id);
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
        </DropdownMenuContent>
      </DropdownMenu>
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
