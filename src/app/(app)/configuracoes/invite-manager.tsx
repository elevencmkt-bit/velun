"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { createInvite, revokeInvite } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";

export type PendingInvite = { id: string; token: string; expiresAt: string };

export function InviteManager({ pendingInvite }: { pendingInvite: PendingInvite | null }) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const link =
    pendingInvite && typeof window !== "undefined"
      ? `${window.location.origin}/convite/${pendingInvite.token}`
      : null;

  function onCreate() {
    setError(null);
    startTransition(async () => {
      try {
        await createInvite();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar convite.");
      }
    });
  }

  function onRevoke() {
    if (!pendingInvite) return;
    startTransition(async () => {
      await revokeInvite(pendingInvite.id);
      router.refresh();
    });
  }

  function onCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (pendingInvite && link) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="h-9 flex-1 rounded-md border border-(--border-primary) bg-(--bg-subtle) px-3 text-sm text-(--text-secondary)"
          />
          <Button type="button" size="sm" variant="secondary" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-metadata">
            Expira em {new Date(pendingInvite.expiresAt).toLocaleDateString("pt-BR")}
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onRevoke}>
            Revogar convite
          </Button>
        </div>
        {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" disabled={isPending} onClick={onCreate} className="w-fit">
        {isPending ? "Gerando..." : "Gerar link de convite"}
      </Button>
      {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
    </div>
  );
}
