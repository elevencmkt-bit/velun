import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Mesmo desenho das outras caixas do app: branca, sem borda, sombra
// leve, cantos de 16px, 48px de altura — alinha com os botões do topo.
export function MonthSelector({
  label,
  prevHref,
  nextHref,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
}) {
  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-(--text-secondary) transition-colors hover:bg-[#F2F4F7] hover:text-(--text-primary)";
  return (
    <div className="flex h-12 items-center gap-1 rounded-[16px] bg-white px-1.5 shadow-(--shadow-card)">
      <Link href={prevHref} className={arrow} aria-label="Mês anterior">
        <ChevronLeft className="h-[18px] w-[18px]" />
      </Link>
      <div className="flex min-w-[150px] items-center justify-center gap-2 px-1 text-[14px] font-semibold text-(--text-primary)">
        <CalendarDays className="h-[18px] w-[18px] text-(--primary)" />
        <span className="inline-block whitespace-nowrap first-letter:uppercase">{label}</span>
      </div>
      <Link href={nextHref} className={arrow} aria-label="Próximo mês">
        <ChevronRight className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}
