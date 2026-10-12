import { CARD_COLORS } from "@/lib/credit-card";

// O cartão desenhado. A estampa são as duas linhas que se encontram do
// símbolo da marca. Nenhuma bandeira nem logo de banco: o cartão é da
// pessoa, a identidade é do Velun.

export function CardArt({
  name,
  color,
  lastFour,
  caption,
  amount,
  owner,
  size = "md",
}: {
  name: string;
  color: string;
  lastFour: string | null;
  caption: string;
  amount: React.ReactNode;
  owner?: string;
  size?: "sm" | "md";
}) {
  const c = CARD_COLORS[color] ?? CARD_COLORS.ink;
  const small = size === "sm";
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[18px] ${small ? "h-[150px] p-4" : "h-[188px] p-5"}`}
      style={{ background: c.bg, color: c.fg }}
    >
      <svg
        viewBox="0 0 220 200"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-12 h-[230px] w-[250px]"
        style={{ opacity: color === "ink" ? 0.28 : 0.2 }}
      >
        <path
          d="M10 10 C80 70 110 120 110 200"
          stroke={c.motif}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d="M210 10 C140 70 110 120 110 200"
          stroke={c.motif}
          strokeWidth={14}
          strokeLinecap="round"
        />
      </svg>
      <div className="relative flex items-start justify-between gap-2">
        <span className="truncate text-[14px] font-semibold">{name}</span>
        {owner ? (
          <span className="shrink-0 text-[12px] opacity-75">{owner}</span>
        ) : null}
      </div>
      {small ? null : (
        <div
          className="relative mt-4 h-7 w-[38px] rounded-md bg-[#D4B46A]"
          aria-hidden
        />
      )}
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] opacity-75">{caption}</div>
          <div className="truncate text-[20px] font-bold tabular-nums md:text-[22px]">
            {amount}
          </div>
        </div>
        {lastFour ? (
          <span className="shrink-0 text-[14px] tracking-[0.14em]">
            •••• {lastFour}
          </span>
        ) : null}
      </div>
    </div>
  );
}
