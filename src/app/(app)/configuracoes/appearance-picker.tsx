"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readThemeChoice, saveThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

// Avisa quem está ouvindo quando a escolha muda nesta aba (o evento
// "storage" só chega de outras abas).
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// Claro, escuro ou o do sistema. Vale pra este aparelho: cada pessoa
// (e cada celular/computador) escolhe o seu.
export function AppearancePicker() {
  const choice = useSyncExternalStore(subscribe, readThemeChoice, () => "system" as ThemeChoice);

  function choose(next: ThemeChoice) {
    saveThemeChoice(next);
    listeners.forEach((cb) => cb());
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
