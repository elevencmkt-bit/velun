"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail } from "lucide-react";
import { createInvite, revokeInvite } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PendingInvite = { id: string; token: string; expiresAt: string; email: string | null };

export function InviteManager({ pendingInvite }: { pendingInvite: PendingInvite | null }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createInvite(email);
        setEmail("");
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
    if (!pendingInvite) return;
    // window só existe no client, mas onCopy só roda em resposta a um
    // clique — nunca durante SSR/hidratação, então não há risco de
    // mismatch aqui (ao contrário de calcular isso no corpo do render).
    const link = `${window.location.origin}/convite/${pendingInvite.token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-card-title">Convide alguém para o seu orçamento</h3>

      <form onSubmit={onInvite} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-light)" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Digite o e-mail da pessoa"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={isPending} className="shrink-0">
          {isPending ? "Convidando..." : "Convidar pessoa"}
        </Button>
      </form>
      {error ? <p className="text-sm text-(--expense)">{error}</p> : null}

      {pendingInvite ? (
        <div
          className="flex flex-col gap-2 rounded-[9px] border p-3"
          style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-subtle)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-(--text-primary)">
                Ou compartilhe um link de convite
              </span>
              <span className="text-metadata">
                {pendingInvite.email
                  ? `Convite pendente para ${pendingInvite.email}.`
                  : "Qualquer pessoa com o link pode se juntar."}
              </span>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={onCopy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar link"}
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
        </div>
      ) : null}
    </div>
  );
}
