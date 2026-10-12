"use client";

import { useTransition } from "react";
import { Bell } from "lucide-react";
import { markNotificationsSeen } from "@/lib/actions/notifications";
import type { VisibilityNotification } from "@/lib/notifications";
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

// Hoje o sino carrega um tipo de aviso só: mudança de visibilidade de
// conta. É deliberado — a regra de que privacidade nunca muda em
// silêncio não pode competir por atenção com lembrete de vencimento.
export function NotificationBell({
  notifications,
}: {
  notifications: VisibilityNotification[];
}) {
  const [, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => n.isNew).length;

  function onOpenChange(open: boolean) {
    if (open && unreadCount > 0) {
      startTransition(() => {
        void markNotificationsSeen();
      });
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-white text-(--text-muted) transition-colors hover:text-(--text-primary) md:h-11 md:w-11"
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
        {notifications.length === 0 ? (
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
