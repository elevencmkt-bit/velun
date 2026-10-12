"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { HIDE_VALUES_COOKIE } from "@/lib/hide-values";

// O olho do topo: borra todos os valores da tela, pra abrir o app no
// ônibus ou mostrar a tela pra alguém sem expor os números.
//
// A escolha fica num cookie (vale um ano), e não só na memória da aba:
// o servidor lê o cookie e a página já chega borrada — sem os números
// piscarem antes de sumir.
export function HideValuesButton({ initialHidden }: { initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.getElementById("app-root")?.toggleAttribute("data-hide-values", next);
    document.cookie = next
      ? `${HIDE_VALUES_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
      : `${HIDE_VALUES_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }

  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-(--text-muted) transition-colors hover:bg-(--bg-subtle) hover:text-(--text-primary)"
    >
      <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
    </button>
  );
}
