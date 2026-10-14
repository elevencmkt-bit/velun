"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, MoreHorizontal, Plus, X } from "lucide-react";
import {
  MOBILE_PRIMARY,
  NAV_ITEMS,
  NEW_TRANSACTION_EVENT,
  isActive,
} from "@/components/nav-items";

// Barra de baixo do celular, como no Organizze e no celular do brand
// book: os três destinos do dia a dia, o botão de lançar no centro — é a
// ação mais frequente do app, então fica ao alcance do polegar — e
// "Mais" pro resto. No computador ela some e quem navega é o menu
// lateral.

const primary = NAV_ITEMS.filter((item) => MOBILE_PRIMARY.includes(item.href));
const secondary = NAV_ITEMS.filter((item) => !MOBILE_PRIMARY.includes(item.href));

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = secondary.some((item) => isActive(pathname, item.href));

  const tab = (href: string, label: string, Icon: (typeof NAV_ITEMS)[number]["icon"]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
          active ? "font-semibold text-(--primary)" : "font-medium text-(--text-muted)"
        }`}
      >
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
        {label}
      </Link>
    );
  };

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-(--bg-surface) px-4 pt-3 pb-[calc(96px+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(17,19,24,0.12)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[15px] font-semibold text-(--text-primary)">Mais</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-(--text-muted) hover:bg-(--bg-subtle)"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex flex-col">
              {secondary.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`flex h-12 items-center gap-3.5 rounded-[10px] px-3 text-[15px] ${
                      active
                        ? "bg-(--primary-light) font-semibold text-(--primary)"
                        : "font-medium text-(--text-primary)"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.8} className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/ajuda"
                onClick={() => setMoreOpen(false)}
                className="flex h-12 items-center gap-3.5 rounded-[10px] px-3 text-[15px] font-medium text-(--text-primary)"
              >
                <CircleHelp size={20} strokeWidth={1.8} className="shrink-0" />
                Central de ajuda
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navegação"
        className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-50 flex h-[68px] items-center rounded-[22px] bg-(--bg-surface)/95 px-1.5 shadow-[0_10px_30px_rgba(16,24,40,0.12)] backdrop-blur md:hidden"
      >
        {tab(primary[0].href, "Início", primary[0].icon)}
        {tab(primary[1].href, "Transações", primary[1].icon)}

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label="Novo lançamento"
            onClick={() => window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT))}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-(--primary) text-white shadow-[0_8px_18px_rgba(83,109,254,0.35)] active:scale-95"
          >
            <Plus size={24} strokeWidth={2.4} />
          </button>
        </div>

        {tab(primary[2].href, "A vencer", primary[2].icon)}

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
            moreActive || moreOpen ? "font-semibold text-(--primary)" : "font-medium text-(--text-muted)"
          }`}
        >
          <MoreHorizontal size={21} strokeWidth={moreActive ? 2.2 : 1.8} />
          Mais
        </button>
      </nav>
    </>
  );
}
