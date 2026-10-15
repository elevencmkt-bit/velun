"use client";

// "Carregando…" no meio da tela enquanto a próxima tela chega (e o
// conteúdo atual fica esmaecido).
//
// O esqueleto (loading.tsx) só aparece quando muda de página. Trocar o
// mês, a conta, o filtro ou o período fica na MESMA página, só muda o
// endereço — e aí nada mexia na tela até o servidor responder (meio
// segundo a um segundo), parecendo que o clique não tinha pegado.
//
// Começa no clique em qualquer link interno (ou quando o código chama
// startNavProgress antes de um router.push) e termina quando o endereço
// muda. Só aparece se demorar mais que um instante, pra não piscar em
// navegação instantânea.

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const listeners = new Set<() => void>();

/** Chame antes de um router.push/replace que muda o endereço. */
export function startNavProgress() {
  for (const l of listeners) l();
}

const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 12_000;

function Loader() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<"idle" | "wait" | "run" | "done">("idle");
  const timers = useRef<number[]>([]);
  const finishRef = useRef<() => void>(() => {});
  const first = useRef(true);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  // Começo.
  useEffect(() => {
    const start = () => {
      clear();
      setPhase("wait");
      document.documentElement.dataset.navPending = "";
      timers.current.push(
        window.setTimeout(() => setPhase((p) => (p === "wait" ? "run" : p)), SHOW_AFTER_MS),
        window.setTimeout(() => finish(), GIVE_UP_MS),
      );
    };
    const finish = () => {
      clear();
      delete document.documentElement.dataset.navPending;
      setPhase((p) => (p === "run" ? "done" : "idle"));
      timers.current.push(window.setTimeout(() => setPhase("idle"), 450));
    };
    finishRef.current = finish;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Mesmo endereço (ou só a âncora #): não há o que carregar.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    listeners.add(start);
    document.addEventListener("click", onClick, true);
    return () => {
      listeners.delete(start);
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  // Fim: o endereço mudou.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    finishRef.current();
  }, [pathname, search]);

  // Escurece o conteúdo enquanto carrega (CSS em globals.css).
  useEffect(() => {
    const el = document.documentElement;
    if (phase === "run") el.dataset.navLoading = "";
    else delete el.dataset.navLoading;
  }, [phase]);

  if (phase === "idle" || phase === "wait") return null;
  // No centro da área de conteúdo (fora o menu lateral), ou da tela.
  const main = document.querySelector("#app-root main")?.getBoundingClientRect();
  const top = main ? Math.max(main.top, 0) : 0;
  const bottom = main ? Math.min(main.bottom, window.innerHeight) : window.innerHeight;
  const box = main
    ? { left: main.left, top, width: main.width, height: Math.max(bottom - top, 80) }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="pointer-events-none fixed z-[200] flex items-center justify-center"
      style={{ ...box, opacity: phase === "run" ? 1 : 0, transition: "opacity 180ms ease" }}
    >
      <div
        className="flex items-center gap-3 rounded-[16px] bg-(--bg-surface) px-5 py-3.5 text-[14px] font-semibold text-(--text-primary)"
        style={{ boxShadow: "var(--shadow-card), 0 12px 32px rgba(16,24,40,.14)", animation: "nav-loading-in 200ms ease-out both" }}
      >
        <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-(--primary-soft) border-t-(--primary)" />
        Carregando…
      </div>
    </div>
  );
}

export function NavProgress() {
  // useSearchParams pede um Suspense em volta.
  return (
    <Suspense fallback={null}>
      <Loader />
    </Suspense>
  );
}
