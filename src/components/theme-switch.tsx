"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readThemeChoice, saveThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

// Quem mostra a escolha (Configurações, menu lateral, "Mais" do celular)
// fica sabendo quando ela muda nesta aba; o evento "storage" só chega
// de outras abas.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readThemeChoice, () => "system" as ThemeChoice);
  return [
    choice,
    (next) => {
      saveThemeChoice(next);
      listeners.forEach((cb) => cb());
    },
  ];
}

/**
 * Claro, escuro ou o do sistema. Vale pra este aparelho (e este
 * navegador). `compact`: só os ícones, pro menu lateral e o celular.
 */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [choice, choose] = useThemeChoice();

  if (compact) {
    return (
      <div role="radiogroup" aria-label="Tema" className="flex gap-0.5 rounded-[11px] bg-(--bg-track) p-0.5">
        {OPTIONS.map(({ value, label, Icon }) => {
          const on = choice === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Tema: ${label}`}
              title={label}
              onClick={() => choose(value)}
              className={`flex h-8 w-9 items-center justify-center rounded-[9px] transition-colors ${
                on ? "bg-(--bg-surface) text-(--text-primary) shadow-(--shadow-sm)" : "text-(--text-muted) hover:text-(--text-primary)"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="flex w-full gap-1 rounded-[14px] bg-(--bg-track) p-1 sm:w-fit">
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(value)}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-[11px] px-4 text-[14px] font-semibold transition-colors sm:flex-none ${
              on
                ? "bg-(--bg-surface) text-(--text-primary) shadow-(--shadow-sm)"
                : "text-(--text-muted) hover:text-(--text-primary)"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
