"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateInput } from "@/components/date-input";
import { startNavProgress } from "@/components/nav-progress";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Kind = "month" | "year" | "all" | "range";
type Target = { month?: string; year?: number; all?: boolean; from?: string; to?: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** Primeiro dia do mês `back` meses atrás: últimos 3 meses = este e os 2 anteriores. */
function monthsBack(today: string, back: number) {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

function brShort(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Seletor de período dos Relatórios: o mesmo de mês das outras telas, com
// mais três jeitos de olhar — um ano, todo o período e datas livres. As
// setas andam um mês (ou um ano); em "todo o período" e "de/até" somem.
//
// Os links mantêm os outros filtros da URL (conta, realizado/a vencer) e
// tiram o que é de outro tipo de período.
export function ReportPeriodSelector({
  kind,
  label,
  month,
  year,
  from,
  to,
  today,
  firstDate,
  prevHref,
  nextHref,
}: {
  kind: Kind;
  label: string;
  /** "2026-09" quando a tela mostra um mês. */
  month: string | null;
  year: number | null;
  from: string | null;
  to: string | null;
  /** Hoje no fuso da casa, "2026-10-13". */
  today: string;
  /** Primeiro lançamento das contas no relatório; null = nenhum. */
  firstDate: string | null;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navigate = (href: string) => {
    startNavProgress();
    router.push(href);
  };
  const thisMonth = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));
  const firstYear = Math.min(thisYear, firstDate ? Number(firstDate.slice(0, 4)) : thisYear, year ?? thisYear);
  const shownYear = () => year ?? Number((month ?? thisMonth).slice(0, 4));

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Kind>(kind);
  const [gridYear, setGridYear] = useState(shownYear);
  const [rangeFrom, setRangeFrom] = useState(from ?? monthsBack(today, 2));
  const [rangeTo, setRangeTo] = useState(to ?? today);
  const [error, setError] = useState<string | null>(null);

  function hrefFor(next: Target) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["month", "year", "all", "from", "to"]) params.delete(key);
    if (next.month) params.set("month", next.month);
    if (next.year) params.set("year", String(next.year));
    if (next.all) params.set("all", "1");
    if (next.from && next.to) {
      params.set("from", next.from);
      params.set("to", next.to);
    }
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  function go(next: Target) {
    setOpen(false);
    navigate(hrefFor(next));
  }

  function applyRange() {
    if (!rangeFrom || !rangeTo) return setError("Escolha as duas datas.");
    setError(null);
    const [a, b] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
    go({ from: a, to: b });
  }

  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)";
  const seg = (on: boolean) =>
    `flex h-8 flex-1 items-center justify-center rounded-[10px] text-[13px] font-semibold whitespace-nowrap transition-colors ${
      on ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.1)]" : "text-(--text-muted) hover:text-(--text-secondary)"
    }`;
  const cell = (on: boolean, now: boolean) =>
    `flex h-10 items-center justify-center rounded-[12px] text-[14px] font-semibold capitalize transition-colors ${
      on
        ? "bg-(--primary) text-white"
        : now
          ? "bg-(--primary-soft) text-(--primary) hover:bg-(--primary-soft)"
          : "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
    }`;
  const chip =
    "rounded-[10px] bg-(--bg-hover) px-2.5 py-1.5 text-[12px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-strong) hover:text-(--text-primary)";

  const years: number[] = [];
  for (let y = thisYear; y >= firstYear; y--) years.push(y);
  const monthsSinceFirst = firstDate
    ? (thisYear - Number(firstDate.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(firstDate.slice(5, 7)) + 1
    : 0;

  return (
    <div className="flex h-12 items-center gap-1 rounded-[16px] bg-(--bg-surface) px-1.5 shadow-(--shadow-card)">
      {prevHref ? (
        <Link href={prevHref} className={arrow} aria-label={kind === "year" ? "Ano anterior" : "Mês anterior"}>
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Link>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Reabre sempre no que está na tela.
          if (next) {
            setTab(kind);
            setGridYear(shownYear());
            setError(null);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Escolher período"
            className="flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-[12px] px-2 text-[14px] font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-hover) data-[state=open]:bg-(--bg-hover)"
          >
            <CalendarDays className="h-[18px] w-[18px] text-(--primary)" />
            <span className="inline-block whitespace-nowrap first-letter:uppercase">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-(--text-muted)" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] rounded-[18px] p-3.5">
          <div role="tablist" aria-label="Tipo de período" className="flex gap-0.5 rounded-[12px] bg-(--bg-track) p-[3px]">
            {(
              [
                ["month", "Mês"],
                ["year", "Ano"],
                ["all", "Tudo"],
                ["range", "De / até"],
              ] as const
            ).map(([value, text]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={seg(tab === value)} onClick={() => setTab(value)}>
                {text}
              </button>
            ))}
          </div>

          {tab === "month" ? (
            <>
              <div className="mt-3 mb-3 flex items-center justify-between">
                <button type="button" onClick={() => setGridYear((y) => y - 1)} className={arrow} aria-label="Ano anterior">
                  <ChevronLeft className="h-[18px] w-[18px]" />
                </button>
                <span className="text-[15px] font-bold tabular-nums text-(--text-primary)">{gridYear}</span>
                <button type="button" onClick={() => setGridYear((y) => y + 1)} className={arrow} aria-label="Próximo ano">
                  <ChevronRight className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((name, i) => {
                  const value = `${gridYear}-${pad(i + 1)}`;
                  return (
                    <Link
                      key={value}
                      href={hrefFor({ month: value })}
                      onClick={() => setOpen(false)}
                      aria-current={kind === "month" && value === month ? "date" : undefined}
                      className={cell(kind === "month" && value === month, value === thisMonth)}
                    >
                      {name}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-(--border-soft) pt-3">
                <Link
                  href={hrefFor({ month: thisMonth })}
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-semibold text-(--primary) hover:bg-(--primary-soft)"
                >
                  Este mês
                </Link>
              </div>
            </>
          ) : null}

          {tab === "year" ? (
            <>
              <p className="mt-3 px-1 text-[13px] leading-relaxed text-(--text-secondary)">
                O ano em curso vai até hoje e é comparado com o mesmo trecho do ano anterior.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {years.map((y) => (
                  <Link
                    key={y}
                    href={hrefFor({ year: y })}
                    onClick={() => setOpen(false)}
                    aria-current={kind === "year" && y === year ? "date" : undefined}
                    className={`${cell(kind === "year" && y === year, y === thisYear)} tabular-nums`}
                  >
                    {y}
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          {tab === "all" ? (
            <div className="mt-3 flex flex-col gap-3 px-1">
              <p className="text-[13px] leading-relaxed text-(--text-secondary)">
                {firstDate ? (
                  <>
                    Desde o primeiro lançamento: <b className="text-(--text-primary)">{brShort(firstDate)} até hoje</b>
                    {monthsSinceFirst > 1 ? ` (${monthsSinceFirst} meses)` : ""}.
                  </>
                ) : (
                  "Ainda não há lançamentos."
                )}
              </p>
              <button
                type="button"
                onClick={() => go({ all: true })}
                className={`h-10 rounded-[12px] text-[14px] font-semibold ${
                  kind === "all" ? "bg-(--primary-soft) text-(--primary)" : "bg-(--primary) text-white"
                }`}
              >
                {kind === "all" ? "É o que está na tela" : "Ver todo o período"}
              </button>
            </div>
          ) : null}

          {tab === "range" ? (
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1 text-[12px] font-semibold text-(--text-muted)">
                  De
                  <DateInput aria-label="De" defaultValue={rangeFrom} onChange={setRangeFrom} className="[&_input]:h-10 [&_input]:rounded-[10px]" />
                </div>
                <div className="flex flex-col gap-1 text-[12px] font-semibold text-(--text-muted)">
                  Até
                  <DateInput aria-label="Até" defaultValue={rangeTo} onChange={setRangeTo} className="[&_input]:h-10 [&_input]:rounded-[10px]" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip} onClick={() => go({ from: monthsBack(today, 2), to: today })}>
                  Últimos 3 meses
                </button>
                <button type="button" className={chip} onClick={() => go({ from: monthsBack(today, 11), to: today })}>
                  Últimos 12 meses
                </button>
              </div>
              {error ? <p className="text-[12px] font-medium text-(--expense-dark)">{error}</p> : null}
              <button type="button" onClick={applyRange} className="h-10 rounded-[12px] bg-(--primary) text-[14px] font-semibold text-white">
                Ver esse período
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {nextHref ? (
        <Link href={nextHref} className={arrow} aria-label={kind === "year" ? "Próximo ano" : "Próximo mês"}>
          <ChevronRight className="h-[18px] w-[18px]" />
        </Link>
      ) : null}
    </div>
  );
}
