import { CalendarClock, Check, ChartNoAxesColumnIncreasing, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { formatCents, type CurrencyCode } from "@/lib/money";
import type { CashFlowInsight, UpcomingEvent } from "@/lib/cash-flow";

function formatEventDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: d.toLocaleDateString("pt-BR", { day: "2-digit" }),
    month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
  };
}

export function UpcomingEventsCard({
  events,
  currency,
}: {
  events: UpcomingEvent[];
  currency: CurrencyCode;
}) {
  const visible = events.slice(0, 6);

  return (
    <article
      className="flex min-h-[230px] flex-col rounded-2xl border p-5"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
          >
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-(--text-primary)">Próximos eventos</h3>
            <p className="text-[10.5px] text-(--text-light)">Entradas e saídas relevantes do período.</p>
          </div>
        </div>
        {visible.length > 0 ? (
          <Link href="/transacoes" className="text-[11px] font-semibold text-(--primary) hover:underline">
            Ver todos
          </Link>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="flex flex-1 items-center text-sm text-(--text-muted)">
          Nenhum lançamento futuro encontrado neste período.
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map((event, i) => {
            const { day, month } = formatEventDate(event.date);
            const isIncome = event.direction === "in";
            return (
              <div
                key={event.id}
                className="grid min-h-[43px] grid-cols-[42px_1fr_auto] items-center gap-2.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}
              >
                <div
                  className="flex min-w-[42px] flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center leading-[1.05]"
                  style={{ background: "#F7F8FC", borderColor: "#E6EAF2", color: "var(--text-secondary)" }}
                >
                  <span className="text-[10px] font-bold">{day}</span>
                  <span className="text-[8px] font-semibold uppercase">{month}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-semibold text-(--text-primary)">{event.description}</p>
                  <p className="text-[9.5px] text-(--text-light)">{event.category_name ?? (isIncome ? "Entrada" : "Saída")}</p>
                </div>
                <span
                  className="text-[11.5px] font-bold tabular-nums"
                  style={{ color: isIncome ? "var(--income)" : "var(--expense)" }}
                >
                  {isIncome ? "+" : "-"}
                  {formatCents(event.amount_cents, currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function ImpactRow({
  label,
  sublabel,
  amount,
  percent,
  currency,
  gradient,
}: {
  label: string;
  sublabel: string;
  amount: number;
  percent: number;
  currency: CurrencyCode;
  gradient: string;
}) {
  return (
    <div className="my-3 grid grid-cols-[130px_1fr_54px] items-center gap-2.5">
      <div>
        <strong className="block text-[11.5px] font-semibold text-(--text-primary)">{label}</strong>
        <span className="text-[9.5px] text-(--text-light)">{sublabel}</span>
      </div>
      <div className="h-[10px] overflow-hidden rounded-full" style={{ background: "#EEF1F6" }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: gradient }} />
      </div>
      <span className="text-right text-[11px] font-semibold tabular-nums text-(--text-secondary)">
        {formatCents(amount, currency)}
      </span>
    </div>
  );
}

export function ImpactsCard({
  totalIncome,
  totalExpense,
  netResult,
  currency,
  periodLabel,
}: {
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  currency: CurrencyCode;
  periodLabel: string;
}) {
  const maxImpact = Math.max(totalIncome, totalExpense, Math.abs(netResult), 1);

  return (
    <article
      className="flex min-h-[230px] flex-col rounded-2xl border p-5"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      <div className="mb-1 flex items-center gap-2.5">
        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          <ChartNoAxesColumnIncreasing className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-(--text-primary)">Impactos na projeção</h3>
          <p className="text-[10.5px] text-(--text-light)">Entradas, saídas e resultado de {periodLabel}.</p>
        </div>
      </div>

      <ImpactRow
        label="Entradas previstas"
        sublabel="Recebimentos pendentes"
        amount={totalIncome}
        percent={Math.round((totalIncome / maxImpact) * 100)}
        currency={currency}
        gradient="linear-gradient(90deg,#20C67A,#18B26B)"
      />
      <ImpactRow
        label="Saídas previstas"
        sublabel="Pagamentos pendentes"
        amount={totalExpense}
        percent={Math.round((totalExpense / maxImpact) * 100)}
        currency={currency}
        gradient="linear-gradient(90deg,#FF6B81,#F04469)"
      />
      <ImpactRow
        label="Resultado do período"
        sublabel="Entradas − saídas"
        amount={netResult}
        percent={Math.round((Math.abs(netResult) / maxImpact) * 100)}
        currency={currency}
        gradient="linear-gradient(90deg,#7C5CFA,#5B6CFF)"
      />

      <div
        className="mt-2 rounded-xl border px-4 py-3.5 text-[10.5px] leading-[1.4]"
        style={{ background: "#F7F8FF", borderColor: "#ECEFFD", color: "var(--text-secondary)" }}
      >
        Neste período: entradas de {formatCents(totalIncome, currency)} e saídas de{" "}
        {formatCents(totalExpense, currency)}, resultado de {formatCents(netResult, currency)}.
      </div>
    </article>
  );
}

export function InsightCard({ insight }: { insight: CashFlowInsight }) {
  return (
    <article
      className="flex min-h-[230px] flex-col rounded-2xl border p-5"
      style={{ background: "#FFFFFF", borderColor: "#E8ECF4", boxShadow: "0 6px 20px rgba(20,28,60,.04)" }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-(--text-primary)">Insight Velun</h3>
          <p className="text-[10.5px] text-(--text-light)">Leitura automática da sua projeção.</p>
        </div>
      </div>

      <div
        className="flex gap-3 rounded-[14px] border p-3.5"
        style={{ background: "linear-gradient(135deg, #F4F2FF 0%, #F8F7FF 100%)", borderColor: "#EBE7FF" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#ECE9FF", color: "#6B5BFF" }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <p className="text-[11px] leading-[1.42] font-semibold" style={{ color: "#5158C8" }}>
          {insight.headline}
        </p>
      </div>

      {insight.bullets.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {insight.bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                style={
                  bullet.tone === "warning"
                    ? { background: "#FFF4E5", color: "#F59E0B" }
                    : { background: "#EAFBF2", color: "#16A34A" }
                }
              >
                {bullet.tone === "warning" ? <TriangleAlert className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              </div>
              <p className="text-[10.5px] leading-[1.35] text-(--text-secondary)">{bullet.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
