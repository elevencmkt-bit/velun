"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Mail } from "lucide-react";
import { ensureInvite, revokeInvite } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PendingInvite = { id: string; token: string; expiresAt: string; email: string | null };

export function InviteManager({ pendingInvite }: { pendingInvite: PendingInvite | null }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function copyToken(token: string) {
    // window só existe no client, mas isso só roda em resposta a uma
    // ação do usuário — nunca durante SSR/hidratação.
    navigator.clipboard.writeText(`${window.location.origin}/convite/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await ensureInvite(email);
        setEmail("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar convite.");
      }
    });
  }

  function onCopyLink() {
    setError(null);
    if (pendingInvite) {
      copyToken(pendingInvite.token);
      return;
    }
    startTransition(async () => {
      try {
        const token = await ensureInvite();
        copyToken(token);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar link.");
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

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-bold text-(--text-primary)">Convide alguém para o seu orçamento</h4>

      <form onSubmit={onInvite} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-(--text-light)" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Digite o e-mail da pessoa"
            className="h-[42px] pl-9 text-[13px]"
          />
        </div>
        <Button type="submit" disabled={isPending} className="h-[42px] shrink-0">
          {isPending ? "Convidando..." : "Convidar pessoa"}
        </Button>
      </form>

      <div
        className="mt-1 flex flex-col items-start gap-3 rounded-xl border p-2.5 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "#E0E5F0", backgroundColor: "rgba(255,255,255,0.62)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
            style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
          >
            <Link2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-(--text-primary)">
              Ou compartilhe um link de convite
              {pendingInvite?.email ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning-dark)" }}
                >
                  Pendente
                </span>
              ) : null}
            </span>
            <span className="text-[11px] text-(--text-light)">
              {pendingInvite?.email
                ? `Convite pendente para ${pendingInvite.email}.`
                : "Qualquer pessoa com o link pode se juntar."}
            </span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={onCopyLink}
          className="w-full shrink-0 sm:w-auto"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Link copiado" : "Copiar link"}
        </Button>
      </div>

      {pendingInvite ? (
        <div className="flex items-center justify-between">
          <span className="text-metadata">
            Expira em {new Date(pendingInvite.expiresAt).toLocaleDateString("pt-BR")}
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onRevoke}>
            Revogar convite
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
    </div>
  );
}
