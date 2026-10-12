import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CARD_COLORS } from "@/lib/credit-card";

// Bloco inteiro no formato de cartão: o fundo é o próprio cartão, sem
// caixa branca em volta. Usado no Dashboard e na lateral de A vencer.

export function CardTile({
  title,
  href,
  linkLabel,
  name,
  lastFour,
  color,
  caption,
  amount,
  usedPct,
  footerLeft,
  footerRight,
  className = "",
}: {
  title: string;
  href: string;
  linkLabel: string;
  name: string;
  lastFour: string | null;
  color: string;
  caption: string;
  amount: React.ReactNode;
  /** Quanto do limite está usado (0–100), ou null sem limite. */
  usedPct: number | null;
  footerLeft: React.ReactNode;
  footerRight?: React.ReactNode;
  className?: string;
}) {
  const c = CARD_COLORS[color] ?? CARD_COLORS.ink;
  return (
    <section
      className={`relative flex min-h-[236px] flex-col overflow-hidden rounded-[24px] p-6 md:p-7 ${className}`}
      style={{ background: c.bg, color: c.fg }}
    >
      <img
        src="/velun-mark.png"
        alt=""
        aria-hidden
        className="object-contain pointer-events-none absolute -top-10 -right-16 h-[300px] w-[320px]"
        style={{ opacity: color === "ink" ? 0.28 : 0.18 }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium opacity-80">{title}</span>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/25"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative mt-4 flex items-center gap-3">
        <div
          className="h-7 w-[38px] shrink-0 rounded-md bg-[#D4B46A]"
          aria-hidden
        />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{name}</div>
          {lastFour ? (
            <div className="text-[12px] tracking-[0.14em] opacity-70">
              •••• {lastFour}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-auto pt-5">
        <div className="text-[13px] opacity-75">{caption}</div>
        <div className="text-[30px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
          {amount}
        </div>
        {usedPct !== null ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${Math.max(2, usedPct)}%` }}
            />
          </div>
        ) : null}
        <div className="mt-2 flex justify-between gap-3 text-[12px] opacity-80">
          <span>{footerLeft}</span>
          {footerRight ? (
            <span className="text-right">{footerRight}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
