"use client";

import { useEffect, useState } from "react";
import { Calculator, Check, Copy, Delete } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMPTY, evaluate, formatNumber, formatTokens, keyFromKeyboard, press, type CalcState, type Key } from "@/lib/calculator";

const ROWS: Key[][] = [
  ["C", "⌫", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["±", "0", ".", "="],
];

const OPS = new Set<Key>(["÷", "×", "−", "+"]);

/** O número grande do visor: o resultado, o que está sendo digitado ou a conta até ali. */
function display(state: CalcState): string {
  if (state.result !== null) return state.result === "Erro" ? "Erro" : formatNumber(Number(state.result));
  const last = state.tokens[state.tokens.length - 1];
  if (last === undefined) return "0";
  if (OPS.has(last as Key)) {
    const partial = evaluate(state.tokens);
    return partial === null ? "0" : formatNumber(partial);
  }
  return formatTokens([last]);
}

// Calculadora do topo, ao lado do olho: abre ali mesmo, sem sair da tela.
// A conta continua lá se fechar e abrir de novo; dá pra usar o teclado.
export function CalculatorButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CalcState>(EMPTY);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = keyFromKeyboard(e.key);
      if (!key) return;
      e.preventDefault();
      setState((s) => press(s, key));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = display(state);

  async function copy() {
    if (shown === "Erro") return;
    try {
      await navigator.clipboard.writeText(shown.replace(/,/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // sem permissão de área de transferência: só não copia
    }
  }

  const keyClass = (k: Key) => {
    if (k === "=") return "bg-(--primary) text-white hover:bg-(--primary-pressed)";
    if (OPS.has(k)) return "bg-(--primary-soft) text-(--primary) hover:bg-(--primary-light)";
    if (k === "C" || k === "⌫" || k === "%" || k === "±") return "bg-(--bg-hover) text-(--text-secondary) hover:bg-(--bg-strong)";
    return "bg-(--bg-subtle) text-(--text-primary) hover:bg-(--bg-hover)";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Calculadora"
          title="Calculadora"
          className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-(--bg-surface) text-(--text-muted) transition-colors hover:text-(--text-primary) data-[state=open]:text-(--primary) md:h-11 md:w-11"
        >
          <Calculator className="h-[19px] w-[19px]" strokeWidth={1.9} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[292px] p-3">
        <div className="rounded-[14px] bg-(--bg-subtle) px-4 pt-2.5 pb-3">
          <div className="flex min-h-5 items-center justify-between gap-2">
            <button
              type="button"
              onClick={copy}
              aria-label="Copiar resultado"
              title="Copiar"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-(--text-light) hover:bg-(--bg-hover) hover:text-(--text-secondary)"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-(--income-dark)" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <span className="truncate text-right text-[13px] text-(--text-muted) tabular-nums" aria-live="polite">
              {formatTokens(state.tokens)}
              {state.result !== null && state.tokens.length > 0 ? " =" : ""}
            </span>
          </div>
          <div
            className={`mt-0.5 truncate text-right font-extrabold tracking-[-0.02em] tabular-nums ${
              shown.length > 12 ? "text-[22px]" : "text-[30px]"
            } ${shown === "Erro" ? "text-(--expense-dark)" : "text-(--text-primary)"}`}
          >
            {shown}
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {ROWS.flat().map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setState((s) => press(s, k))}
              aria-label={k === "⌫" ? "Apagar" : k === "C" ? "Limpar" : k === "±" ? "Trocar sinal" : k}
              className={`flex h-12 items-center justify-center rounded-[12px] text-[17px] font-semibold transition-colors ${keyClass(k)}`}
            >
              {k === "⌫" ? <Delete className="h-[18px] w-[18px]" /> : k}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
