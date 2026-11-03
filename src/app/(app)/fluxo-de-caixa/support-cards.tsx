import Link from "next/link";
import type { CurrencyCode } from "@/lib/money";
import type { UpcomingEvent } from "@/lib/cash-flow";
import type { CategoryEstimate } from "@/lib/cash-flow-estimates";
import { addDaysISO } from "@/lib/today";
import { Money } from "@/components/money";

// "16 out", sem o "de" que o pt-BR põe no meio e quebra a coluna.
function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const month = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${d.getDate()} ${month}`;
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

/** Quanto entra, sai e sobra no período, e a frase do que vale ficar de olho. */
export function PeriodSummaryCard({
  periodLabel,
  totalIncome,
  totalExpense,
  netResult,
  estimatedCents,
  note,
  currency,
}: {
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  /** Entra − sai lançados (sem estimados). */
  netResult: number;
  /** Gastos estimados no período; null = desligados. */
  estimatedCents: number | null;
  note: string;
  currency: CurrencyCode;
}) {
  const net = netResult - (estimatedCents ?? 0);
  return (
    <article className="flex min-w-0 flex-col gap-4 self-start rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:p-6">
      <h2 className="text-card-title">Nos próximos {periodLabel}</h2>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-(--text-muted)">Entra</span>
          <span className="font-bold tabular-nums text-(--income-dark)">
            +<Money cents={totalIncome} currency={currency} />
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-(--text-muted)">{estimatedCents !== null ? "Sai (lançado)" : "Sai"}</span>
          <span className="font-bold tabular-nums text-(--text-primary)">
            −<Money cents={totalExpense} currency={currency} />
          </span>
        </div>
        {estimatedCents !== null ? (
          <div className="flex justify-between text-sm">
            <span className="text-(--text-muted)">Estimado (limites)</span>
            <span className="font-bold tabular-nums text-(--text-primary)">
              −<Money cents={estimatedCents} currency={currency} />
            </span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-(--border-soft) pt-3 text-[15px]">
          <span className="font-semibold text-(--text-primary)">{net >= 0 ? "Sobra" : "Falta"}</span>
          <span className="font-bold tabular-nums text-(--text-primary)">
            {net >= 0 ? "+" : "−"}
            <Money cents={Math.abs(net)} currency={currency} />
          </span>
        </div>
        {estimatedCents !== null && estimatedCents > 0 ? (
          <p className="text-xs text-(--text-muted)">
            Sem os estimados, {netResult >= 0 ? "sobraria" : "faltaria"} {netResult >= 0 ? "+" : "−"}
            <Money cents={Math.abs(netResult)} currency={currency} />.
          </p>
        ) : null}
      </div>
      {note ? (
        <div className="rounded-[16px] bg-(--primary-soft) p-4 text-sm leading-relaxed text-(--text-secondary)">
          <div className="mb-1 text-xs font-bold text-(--primary-hover)">Fique de olho</div>
          {note}
        </div>
      ) : null}
    </article>
  );
}

/** De onde vêm os gastos estimados: cada limite das Metas e quanto ainda conta. */
export function EstimatesCard({
  categories,
  floor,
  currency,
}: {
  categories: CategoryEstimate[];
  floor: { cents: number; source: "manual" | "goals" | "none" };
  currency: CurrencyCode;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-card-title">Gastos estimados</h2>
        <Link href="/metas" className="text-[13px] font-semibold text-(--primary) hover:underline">
          Limites em Metas →
        </Link>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-(--text-muted)">
        Dos limites de gasto das Metas, espalhados igual por dia. Este mês, só o que ainda falta gastar; nos
        próximos, o limite menos o que já está lançado na categoria.
      </p>
      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">
          Nenhum limite de gasto em Metas. Crie limites (mercado, gasolina) pra projeção contar com eles.
        </p>
      ) : (
        <div className="mt-2">
          {categories.map((c) => {
            const used = c.limitCents > 0 ? Math.min(1, c.spentCents / c.limitCents) : 0;
            return (
              <div key={c.categoryId} className="flex items-center justify-between gap-4 border-b border-(--border-soft) py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-(--text-primary)">
                    {c.name} <span className="font-normal text-(--text-muted)">· limite <Money cents={c.limitCents} currency={currency} /></span>
                  </div>
                  <div className="mt-1.5 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-(--bg-track)">
                    <div className="h-full rounded-full bg-(--primary-border)" style={{ width: `${used * 100}%` }} />
                  </div>
                  {c.plannedThisMonthCents > 0 ? (
                    <div className="mt-1 text-xs text-(--text-muted)">
                      <Money cents={c.plannedThisMonthCents} currency={currency} /> já lançados na categoria este mês
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-sm">
                  <b className="tabular-nums">
                    <Money cents={c.remainingThisMonthCents} currency={currency} />
                  </b>{" "}
                  este mês
                  <div className="text-xs text-(--text-muted)">
                    <Money cents={c.spentCents} currency={currency} /> já gastos
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-(--text-muted)">
        Categoria sem limite não entra.{" "}
        {floor.cents > 0 ? (
          <>
            Piso de segurança: <b className="text-(--text-secondary)"><Money cents={floor.cents} currency={currency} /></b>
            {floor.source === "goals" ? " (metas Colchão e Reserva de impostos)" : ""} ·{" "}
          </>
        ) : (
          "Sem piso de segurança · "
        )}
        <Link href="/configuracoes#piso" className="font-semibold text-(--primary) hover:underline">
          mudar em Configurações
        </Link>
      </p>
    </article>
  );
}
