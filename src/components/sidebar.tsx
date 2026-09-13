"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarClock,
  LayoutDashboard,
  Upload,
  TrendingUp,
  Wallet,
  PieChart,
  Settings,
} from "lucide-react";

const ICON_PROPS = { size: 20, strokeWidth: 1.8 };

const NAV = [
  { href: "/mes", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/a-pagar", label: "A vencer", icon: CalendarClock },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: TrendingUp },
  { href: "/relatorios", label: "Relatórios", icon: PieChart },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const DISABLED_NAV = [{ label: "Importar", icon: Upload }];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-full w-[232px] shrink-0 flex-col justify-between"
      style={{ background: "var(--sidebar-bg-gradient)" }}
    >
      <div className="flex flex-col gap-8 px-5 pt-6">
        <div className="flex items-center gap-3 px-1">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px]"
            style={{ boxShadow: "var(--sidebar-active-shadow)" }}
          >
            <Image src="/velun-icon.png" alt="Velun" width={48} height={48} className="h-full w-full" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[19px] font-bold text-white">Velun</span>
            <span className="text-[12px] font-normal" style={{ color: "var(--sidebar-fg-muted)" }}>
              Dashboard Financeiro
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {NAV.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[46px] items-center gap-3.5 rounded-[9px] px-3.5 py-3 text-[14px] font-medium transition-colors ${
                  isActive ? "text-white" : "text-(--sidebar-fg) hover:bg-white/[.06] hover:text-white"
                }`}
                style={{
                  background: isActive ? "var(--sidebar-active-gradient)" : "transparent",
                  boxShadow: isActive ? "var(--sidebar-active-shadow)" : "none",
                }}
              >
                <Icon {...ICON_PROPS} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
          {DISABLED_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                aria-disabled="true"
                title="Em breve"
                className="flex min-h-[46px] cursor-not-allowed items-center gap-3.5 rounded-[9px] px-3.5 py-3 text-[14px] font-medium opacity-40"
                style={{ color: "var(--sidebar-fg)" }}
              >
                <Icon {...ICON_PROPS} className="shrink-0" />
                {item.label}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="p-5">
        <div
          className="flex flex-col gap-1 rounded-xl p-4"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-sm font-medium text-white">Um só caixa, dois nomes</span>
          <span className="text-xs" style={{ color: "var(--sidebar-fg-muted)" }}>
            Visibilidade compartilhada, decisões em conjunto.
          </span>
        </div>
      </div>
    </aside>
  );
}
