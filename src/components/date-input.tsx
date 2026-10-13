"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brToIso, isoToBr, maskBr } from "@/lib/br-date";

// Campo de data em dd/mm/aaaa.
//
// O <input type="date"> do navegador mostra a data na ordem do idioma do
// NAVEGADOR (num Chrome em inglês, mm/dd/aaaa), não da página — e não
// tem como mudar isso. Então o campo visível é texto com máscara, e o
// calendário do navegador continua disponível pelo botão ao lado.
//
// O formulário recebe a data em ISO (aaaa-mm-dd) num campo escondido com
// o `name`, como antes: nada muda pra quem lê o formulário.

export function DateInput({
  id,
  name,
  defaultValue = "",
  required = false,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  /** ISO, aaaa-mm-dd. */
  defaultValue?: string;
  required?: boolean;
  /** Chamado com a data em ISO quando fica completa e válida, ou "" ao apagar. */
  onChange?: (iso: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [iso, setIso] = useState(defaultValue);
  const [text, setText] = useState(isoToBr(defaultValue));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  function commit(next: string) {
    setIso(next);
    onChange?.(next);
  }

  function onType(raw: string) {
    const masked = maskBr(raw);
    setText(masked);
    const el = textRef.current;
    if (masked === "") {
      el?.setCustomValidity("");
      commit("");
      return;
    }
    const parsed = brToIso(masked);
    if (parsed) {
      el?.setCustomValidity("");
      if (parsed !== iso) commit(parsed);
    } else {
      el?.setCustomValidity(
        masked.length === 10 ? "Essa data não existe." : "Complete a data: dd/mm/aaaa.",
      );
    }
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        ref={textRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        aria-label={ariaLabel}
        value={text}
        required={required}
        onChange={(e) => onType(e.target.value)}
        className="pr-9 tabular-nums"
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Abrir calendário"
        className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-(--text-muted) hover:bg-(--bg-subtle) hover:text-(--text-secondary)"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {/* Calendário do navegador, invisível, ancorado no botão. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={iso}
        onChange={(e) => {
          const next = e.target.value;
          setText(isoToBr(next));
          textRef.current?.setCustomValidity("");
          commit(next);
        }}
        className="pointer-events-none absolute right-1.5 bottom-0 h-7 w-7 opacity-0"
      />
      {name ? <input type="hidden" name={name} value={iso} /> : null}
    </div>
  );
}
