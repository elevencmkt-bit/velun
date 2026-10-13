"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markNotificationsSeen } from "@/lib/actions/notifications";
import { approveAccountDeletion, declineAccountDeletion } from "@/lib/actions/accounts";
import type { DeletionRequest, VisibilityNotification } from "@/lib/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function relativeDay(iso: string) {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return then.toLocaleDateString("pt-BR");
}

// O sino carrega o que mexe na confiança entre os dois: mudança de
// visibilidade de conta e pedido pra excluir conta do casal. É
// deliberado — isso não pode competir por atenção com lembrete de
// vencimento.
export function NotificationBell({
  notifications,
  deletionRequests = [],
}: {
  notifications: VisibilityNotification[];
  /** Pedidos do outro, esperando o seu aval. */
  deletionRequests?: DeletionRequest[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Pedido esperando resposta conta como não lido até ser respondido.
  const unreadCount = notifications.filter((n) => n.isNew).length + deletionRequests.length;

  function decide(id: string, approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = approve ? await approveAccountDeletion(id) : await declineAccountDeletion(id);
      if (!result.ok) {
        setError(result.error ?? "Não deu certo.");
        return;
      }
      router.refresh();
    });
  }

  function onOpenChange(open: boolean) {
    if (open && notifications.some((n) => n.isNew)) {
      startTransition(() => {
        void markNotificationsSeen();
      });
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-(--bg-surface) text-(--text-muted) transition-colors hover:text-(--text-primary) md:h-11 md:w-11"
          aria-label={
            unreadCount > 0
              ? `Notificações, ${unreadCount} não lidas`
              : "Notificações"
          }
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          {unreadCount > 0 ? (
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--expense)" }}
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        {deletionRequests.length > 0 ? (
          <ul className="mb-3 flex flex-col gap-3 border-b border-(--border-soft) pb-3">
            {deletionRequests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2">
                <p className="text-sm text-(--text-primary)">
                  <span className="font-medium">{r.requestedByName}</span> pediu pra excluir a conta do casal{" "}
                  <span className="font-medium">{r.accountName}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => decide(r.id, true)}
                    className="h-8 rounded-[10px] bg-(--expense) px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => decide(r.id, false)}
                    className="h-8 rounded-[10px] bg-(--bg-track) px-3 text-xs font-semibold text-(--text-secondary) disabled:opacity-50"
                  >
                    Recusar
                  </button>
                </div>
              </li>
            ))}
            {error ? <li className="text-xs text-(--expense-dark)">{error}</li> : null}
          </ul>
        ) : null}
        {notifications.length === 0 && deletionRequests.length === 0 ? (
          <p className="text-sm text-(--text-muted)">Nenhuma notificação por enquanto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-col gap-0.5">
                <p className="text-sm text-(--text-primary)">
                  <span className="font-medium">{n.changedByName}</span> mudou a
                  visibilidade da conta{" "}
                  <span className="font-medium">{n.accountName}</span>
                </p>
                <p className="text-xs text-(--text-muted)">
                  de &ldquo;{n.fromLabel}&rdquo; para &ldquo;{n.toLabel}&rdquo; ·{" "}
                  {relativeDay(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
