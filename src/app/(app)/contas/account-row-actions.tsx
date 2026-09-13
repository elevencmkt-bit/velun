"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveAccount, unarchiveAccount } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";

export function AccountRowActions({
  accountId,
  isArchived,
}: {
  accountId: string;
  isArchived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          if (isArchived) await unarchiveAccount(accountId);
          else await archiveAccount(accountId);
          router.refresh();
        })
      }
    >
      {isArchived ? "Reativar" : "Arquivar"}
    </Button>
  );
}
