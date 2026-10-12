"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/components/nav-items";

// Menu lateral do computador. Claro, como no brand book: superfície
// branca, um fio separando do conteúdo, e o item ativo marcado em azul
// suave — a cor da marca aparece onde está a atenção, não no menu todo.
// No celular ele some e quem navega é a barra de baixo (MobileNav).

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-[240px] shrink-0 flex-col justify-between border-r border-(--border-primary) bg-white md:flex">
      <div className="flex flex-col gap-7 px-4 pt-6">
        <Link href="/mes" className="flex items-center gap-2.5 px-2" aria-label="Velun — início">
          <Image src="/velun-icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px]" />
          <span className="text-[19px] font-bold tracking-[-0.02em] text-(--text-primary)">velun</span>
        </Link>

        <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-[9px] px-3 text-[14px] transition-colors ${
                  active
                    ? "bg-(--primary-light) font-semibold text-(--primary)"
                    : "font-medium text-(--text-secondary) hover:bg-(--bg-subtle) hover:text-(--text-primary)"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.1 : 1.8} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4">
        <div className="flex flex-col gap-1 rounded-xl bg-(--primary-soft) p-4">
          <span className="text-[13px] font-semibold text-(--text-primary)">Juntos, cada um com o seu</span>
          <span className="text-xs leading-relaxed text-(--text-muted)">
            Conta do casal, os dois veem. Conta sua, você escolhe o que o outro vê.
          </span>
        </div>
      </div>
    </aside>
  );
}
