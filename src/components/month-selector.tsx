"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Seletor de mês do Dashboard, Transações e Relatórios. As setas andam um
// mês; clicar no nome abre um quadro com ano e os 12 meses, pra pular
// direto pra um período longe sem clicar seta por seta.
//
// Os links do quadro mantêm os outros filtros da URL (conta, categoria,
// visão…) e tiram o que é outro tipo de período (de/até, todo o período).
export function MonthSelector({
  label,
  prevHref,
  nextHref,
  month,
  today,
  allPeriod,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
  /** Mês mostrado, "2026-09". Sem ele (período que não é um mês), o quadro abre no mês de hoje. */
  month?: string | null;
  /** Hoje no fuso da casa, "2026-10-13". */
  today: string;
  /** Mostra "Todo o período" no quadro; `active` quando é o que está na tela. */
  allPeriod?: { active: boolean };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const thisMonth = today.slice(0, 7);
  const shown = month ?? null;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((shown ?? thisMonth).slice(0, 4)));

  function hrefFor(next: { month?: string; all?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["month", "from", "to", "all"]) params.delete(key);
    if (next.month) params.set("month", next.month);
    if (next.all) params.set("all", "1");
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-(--text-secondary) transition-colors hover:bg-[#F2F4F7] hover:text-(--text-primary)";

  return (
    <div className="flex h-12 items-center gap-1 rounded-[16px] bg-white px-1.5 shadow-(--shadow-card)">
      <Link href={prevHref} className={arrow} aria-label="Mês anterior">
        <ChevronLeft className="h-[18px] w-[18px]" />
      </Link>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Reabre sempre no ano do que está na tela.
          if (next) setYear(Number((shown ?? thisMonth).slice(0, 4)));
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Escolher mês e ano"
            className="flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-[12px] px-2 text-[14px] font-semibold text-(--text-primary) transition-colors hover:bg-[#F2F4F7] data-[state=open]:bg-[#F2F4F7]"
          >
            <CalendarDays className="h-[18px] w-[18px] text-(--primary)" />
            <span className="inline-block whitespace-nowrap first-letter:uppercase">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-(--text-muted)" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-[296px] rounded-[18px] p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className={arrow}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <span className="text-[15px] font-bold tabular-nums text-(--text-primary)">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className={arrow}
              aria-label="Próximo ano"
            >
              <ChevronRight className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((name, i) => {
              const value = `${year}-${String(i + 1).padStart(2, "0")}`;
              const isShown = value === shown;
              const isNow = value === thisMonth;
              return (
                <Link
                  key={value}
                  href={hrefFor({ month: value })}
                  onClick={() => setOpen(false)}
                  aria-current={isShown ? "date" : undefined}
                  className={`flex h-10 items-center justify-center rounded-[12px] text-[14px] font-semibold capitalize transition-colors ${
                    isShown
                      ? "bg-(--primary) text-white"
                      : isNow
                        ? "bg-(--primary-soft) text-(--primary) hover:bg-(--primary-soft)"
                        : "text-(--text-secondary) hover:bg-[#F2F4F7] hover:text-(--text-primary)"
                  }`}
                >
                  {name}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-(--border-soft) pt-3">
            <Link
              href={hrefFor({ month: thisMonth })}
              onClick={() => setOpen(false)}
              className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-semibold text-(--primary) hover:bg-(--primary-soft)"
            >
              Este mês
            </Link>
            {allPeriod ? (
              <Link
                href={hrefFor({ all: true })}
                onClick={() => setOpen(false)}
                aria-current={allPeriod.active ? "true" : undefined}
                className={`rounded-[10px] px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  allPeriod.active
                    ? "bg-(--primary) text-white"
                    : "text-(--text-secondary) hover:bg-[#F2F4F7] hover:text-(--text-primary)"
                }`}
              >
                Todo o período
              </Link>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <Link href={nextHref} className={arrow} aria-label="Próximo mês">
        <ChevronRight className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}
