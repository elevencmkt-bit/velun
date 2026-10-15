"use client";

// Barra fina no topo enquanto a próxima tela carrega.
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

function Bar() {
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

  if (phase === "idle" || phase === "wait") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div
        className="h-full rounded-r-full bg-(--primary) shadow-[0_0_8px_var(--primary)]"
        style={
          phase === "run"
            ? { width: "85%", animation: "nav-progress-run 8s cubic-bezier(.08,.7,.2,1) both" }
            : { width: "100%", opacity: 0, transition: "width 160ms ease-out, opacity 300ms ease 140ms" }
        }
      />
    </div>
  );
}

export function NavProgress() {
  // useSearchParams pede um Suspense em volta.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
