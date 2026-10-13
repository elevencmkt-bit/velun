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
  const [invited, setInvited] = useState(false);
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
        // O Velun não manda email: gerar o convite já copia o link, pra
        // quem convidou mandar por onde quiser.
        const token = await ensureInvite(email);
        copyToken(token);
        setInvited(true);
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
    <div
      id="convite"
      className="flex scroll-mt-24 flex-col gap-3 rounded-[18px] bg-(--bg-surface)/75 p-5 shadow-[0_1px_3px_rgba(16,24,40,.05)] md:p-6"
    >
      <h3 className="text-sm font-bold text-(--text-primary)">Convite</h3>

      <form onSubmit={onInvite} className="flex flex-col gap-2">
        <label htmlFor="invite-email" className="text-xs font-semibold text-(--text-secondary)">
          Email da pessoa
        </label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-(--text-light)" />
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@email.com"
              className="h-11 pl-9"
            />
          </div>
          <Button type="submit" disabled={isPending} className="h-11 shrink-0">
            {isPending ? "Gerando..." : "Gerar convite"}
          </Button>
        </div>
        <span className="text-xs text-(--text-light)">Só esse email vai poder usar o link.</span>
      </form>

      {invited ? (
        <p className="text-xs text-(--text-secondary)">
          Link copiado. O Velun não manda email — cole o link numa mensagem pra ela (WhatsApp,
          por exemplo). Vale por 7 dias e só uma vez.
        </p>
      ) : null}

      <div className="mt-1 flex flex-col items-start gap-3 border-t border-(--border-soft) pt-4 sm:flex-row sm:items-center">
        <Link2 className="h-[18px] w-[18px] shrink-0 text-(--text-muted) max-sm:hidden" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] text-(--text-secondary)">
            {pendingInvite?.email
              ? `Convite pendente — só ${pendingInvite.email} pode usar o link.`
              : "Ou mande um link que qualquer pessoa pode usar"}
            {pendingInvite?.email ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning-dark)" }}
              >
                Pendente
              </span>
            ) : null}
          </span>
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
