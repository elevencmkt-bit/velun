import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export function MonthSelector({
  label,
  prevHref,
  nextHref,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div
      className="flex h-10 items-center gap-1 rounded-[9px] border bg-white px-1.5 shadow-[0_1px_2px_rgba(16,24,40,.03)]"
      style={{ borderColor: "var(--border-primary)" }}
    >
      <Link
        href={prevHref}
        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-(--text-muted) transition-colors hover:bg-[--border-soft] hover:text-(--text-primary)"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="flex items-center gap-1.5 px-1.5 text-[13px] font-medium text-(--text-primary)">
        <CalendarDays className="h-4 w-4 text-(--text-muted)" />
        <span className="capitalize">{label}</span>
      </div>
      <Link
        href={nextHref}
        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-(--text-muted) transition-colors hover:bg-[--border-soft] hover:text-(--text-primary)"
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
