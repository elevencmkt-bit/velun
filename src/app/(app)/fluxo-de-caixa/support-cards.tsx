import Link from "next/link";
import type { CurrencyCode } from "@/lib/money";
import type { UpcomingEvent } from "@/lib/cash-flow";
import { addDaysISO } from "@/lib/today";
import { Money } from "@/components/money";

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    .replace(".", "");
}

// Segunda-feira da semana de uma data (AAAA-MM-DD).
function weekStart(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const back = (d.getDay() + 6) % 7;
  return addDaysISO(iso, -back);
}

function groupLabel(date: string, today: string) {
  const thisWeek = weekStart(today);
  const w = weekStart(date);
  if (w === thisWeek) return "Esta semana";
  if (w === addDaysISO(thisWeek, 7)) return "Semana que vem";
  const d = new Date(`${date}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  if (d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()) return "Até o fim do mês";
  const month = d.toLocaleDateString("pt-BR", { month: "long" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/** Próximos eventos, agrupados por semana (e depois por mês). */
export function UpcomingEventsCard({
  events,
  currency,
  today,
  limit = 10,
}: {
  events: UpcomingEvent[];
  currency: CurrencyCode;
  today: string;
  limit?: number;
}) {
  const visible = events.slice(0, limit);
  const groups: { label: string; items: UpcomingEvent[] }[] = [];
  for (const e of visible) {
    const label = groupLabel(e.date, today);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <article className="flex min-w-0 flex-col rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-card-title">Próximos eventos</h2>
        <Link href="/a-pagar" className="text-[13px] font-semibold text-(--primary) hover:underline">
          Ver tudo em A vencer →
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">Nenhum lançamento futuro neste período.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <div className="mt-4 mb-1 text-[11px] font-bold tracking-[0.04em] text-(--text-light) uppercase">
              {g.label}
            </div>
            {g.items.map((e) => {
              const isIncome = e.direction === "in";
              return (
                <div
                  key={e.id}
                  className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) last:border-0"
                >
                  <span className="w-12 shrink-0 text-xs font-semibold text-(--text-muted)">{shortDate(e.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--text-primary)">
                    {e.description}
                  </span>
                  <span
                    className="shrink-0 text-sm font-bold tabular-nums"
                    style={{ color: isIncome ? "var(--income-dark)" : "var(--text-primary)" }}
                  >
                    {isIncome ? "+" : "−"}
                    <Money cents={e.amount_cents} currency={currency} />
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}
    </article>
  );
}

/** Quanto entra, sai e sobra no período, e a frase do que ficar de olho. */
export function PeriodSummaryCard({
  periodLabel,
  totalIncome,
  totalExpense,
  netResult,
  note,
  currency,
}: {
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  note: string;
  currency: CurrencyCode;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:p-6">
      <h2 className="text-card-title">Nos próximos {periodLabel}</h2>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-(--text-muted)">Entra</span>
          <span className="font-bold tabular-nums text-(--income-dark)">
            +<Money cents={totalIncome} currency={currency} />
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-(--text-muted)">Sai</span>
          <span className="font-bold tabular-nums text-(--text-primary)">
            −<Money cents={totalExpense} currency={currency} />
          </span>
        </div>
        <div className="flex justify-between border-t border-(--border-soft) pt-3 text-[15px]">
          <span className="font-semibold text-(--text-primary)">{netResult >= 0 ? "Sobra" : "Falta"}</span>
          <span className="font-bold tabular-nums text-(--text-primary)">
            {netResult >= 0 ? "+" : "−"}
            <Money cents={Math.abs(netResult)} currency={currency} />
          </span>
        </div>
      </div>
      {note ? (
        <div className="mt-auto rounded-[16px] bg-[#F5F6FF] p-4 text-sm leading-relaxed text-(--text-secondary)">
          <div className="mb-1 text-xs font-bold text-[#4257CB]">O que fica de olho</div>
          {note}
        </div>
      ) : null}
    </article>
  );
}
