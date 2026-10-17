"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { RecurrenceScope } from "@/lib/recurrence";

/**
 * "Salvar a mudança em quais?" — aparece ao salvar um lançamento que faz
 * parte de uma recorrência, quando mudou nome, valor, tipo ou categoria.
 */
export function RecurrenceScopeDialog({
  open,
  onOpenChange,
  name,
  changeText,
  date,
  allowAll,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  /** Ex.: "valor: $288,00 → $282,00". */
  changeText: string;
  /** Data do lançamento editado, dd/mm. */
  date: string;
  allowAll: boolean;
  busy: boolean;
  onConfirm: (scope: RecurrenceScope) => void;
}) {
  const [scope, setScope] = useState<RecurrenceScope>("future");
  const confirmRef = useRef<HTMLButtonElement>(null);

  const options: { value: RecurrenceScope; title: string; text: string; disabled?: boolean }[] = [
    {
      value: "one",
      title: "Só este lançamento",
      text: `Muda só o de ${date}. Os próximos continuam como estão. Bom pra exceção, como uma multa por atraso.`,
    },
    {
      value: "future",
      title: "Este e os próximos",
      text: "A recorrência passa a ser assim: muda este e as próximas previsões. O que já caiu fica como aconteceu.",
    },
    {
      value: "all",
      title: "Todos, inclusive os que já passaram",
      text: allowAll
        ? "Nome e categoria em todos os lançamentos dessa recorrência, até os que já caíram."
        : "Só pra nome e categoria. Valor de lançamento que já caiu não muda.",
      disabled: !allowAll,
    },
  ];
  const label =
    scope === "one" ? "Salvar só neste" : scope === "future" ? "Salvar neste e nos próximos" : "Salvar em todos";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="gap-4 rounded-[24px] bg-(--bg-surface) p-5 sm:max-w-[500px] sm:p-6"
        // Foco no botão de salvar, não na primeira opção (que parecia marcada).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <div>
          <DialogTitle className="text-[20px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
            Salvar a mudança em quais?
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-(--text-secondary)">
            {name} é uma recorrência. Você mudou o <b className="text-(--text-primary)">{changeText}</b>.
          </DialogDescription>
        </div>

        <div role="radiogroup" aria-label="Aplicar em" className="flex flex-col gap-2.5">
          {options.map((o) => {
            const on = scope === o.value && !o.disabled;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={o.disabled || busy}
                onClick={() => setScope(o.value)}
                className={`flex w-full items-start gap-3.5 rounded-[16px] border-[1.5px] p-4 text-left transition-colors ${
                  o.disabled
                    ? "cursor-not-allowed border-(--border-soft) bg-(--bg-subtle)"
                    : on
                      ? "border-(--primary) bg-(--primary-soft) shadow-[0_0_0_3px_rgba(83,109,254,.12)]"
                      : "border-(--border-primary) bg-(--bg-surface) hover:bg-(--bg-hover)"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
                    on ? "border-(--primary)" : "border-(--border-strong)"
                  }`}
                >
                  {on ? <span className="h-2.5 w-2.5 rounded-full bg-(--primary)" /> : null}
                </span>
                <span className="flex flex-col gap-1">
                  <span
                    className={`text-[15px] font-bold ${o.disabled ? "text-(--text-muted)" : "text-(--text-primary)"}`}
                  >
                    {o.title}
                  </span>
                  <span className={`text-[13px] leading-relaxed ${o.disabled ? "text-(--text-muted)" : "text-(--text-secondary)"}`}>
                    {o.text}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex gap-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="h-[50px] flex-1 rounded-[14px] text-[15px] font-semibold"
          >
            Voltar
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={() => onConfirm(scope)}
            className="h-[50px] flex-[2] rounded-[14px] text-[15px] font-bold shadow-[0_8px_20px_rgba(83,109,254,.3)]"
          >
            {busy ? "Salvando…" : label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
