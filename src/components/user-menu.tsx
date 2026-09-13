"use client";

import { ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  displayName,
  subtitle,
  onLogout,
}: {
  displayName: string;
  subtitle: string;
  onLogout: () => void;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 outline-none transition-colors hover:bg-[--border-soft]">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: "var(--sidebar-active-gradient)" }}
          >
            {initial}
          </div>
          <div className="hidden flex-col items-start leading-tight sm:flex">
            <span className="text-[13px] font-medium text-(--text-primary)">{displayName}</span>
            <span className="text-metadata">{subtitle}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-(--text-light)" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="text-sm font-medium text-(--text-primary)">{displayName}</span>
          <span className="text-xs font-normal text-(--text-muted)">{subtitle}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onLogout()}>
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
