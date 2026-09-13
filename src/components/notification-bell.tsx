"use client";

import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Sem sistema de notificações ainda — o sino existe só como affordance
// visual (seção 4 do refinamento), sem contador nem bolinha falsa.
export function NotificationBell() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-(--text-muted) transition-colors hover:bg-[--border-soft] hover:text-(--text-primary)"
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-3">
        <p className="text-sm text-(--text-muted)">Nenhuma notificação por enquanto.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
