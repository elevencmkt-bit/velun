import Link from "next/link";
import type { CurrencyCode } from "@/lib/money";
import type { FreeThisWeek } from "@/lib/free-this-week";
import { Money } from "@/components/money";

const TONES = {
  free: { bg: "var(--income-soft)", border: "#a8eedc", dot: "var(--income)", ring: "#c9f5e9", ink: "var(--income-dark)" },
  essentials: { bg: "var(--warning-soft)", border: "#fedf89", dot: "var(--warning)", ring: "var(--warning-badge)", ink: "var(--warning-ink)" },
  short: { bg: "var(--danger-soft)", border: "#fecdca", dot: "var(--expense)", ring: "var(--danger-badge)", ink: "var(--danger-ink)" },
} as const;

function day(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
}

/** O semáforo do "Livre esta semana", com a conta aberta em "Como calculamos". */
export function FreeThisWeekCard({ free, currency }: { free: FreeThisWeek; currency: CurrencyCode }) {
  const tone = TONES[free.state];
  const money = (cents: number) => <Money cents={Math.abs(cents)} currency={currency} />;
  const hasFloor = free.floorCents > 0;
  const title =
    free.state === "free" ? (
      <>Livre até {day(free.until)}: {money(free.freeCents)}</>
    ) : free.state === "essentials" ? (
      "Só essenciais"
    ) : (
      "Segura até o essencial"
    );
  const message =
    free.state === "free" ? (
      <>Dá pra gastar isso além do mercado e da gasolina{hasFloor ? ", sem passar do piso" : ""}.</>
    ) : free.state === "essentials" ? (
      <>Sobram só {money(free.freeCents)} além do mercado e da gasolina até {day(free.until)}.</>
    ) : (
      <>
        Faltam {money(free.freeCents)} {hasFloor ? "pra chegar no piso" : "pra não ficar no vermelho"} até {day(free.until)}.
      </>
    );

  const line = (label: string, cents: number, sign: "+" | "−" | "") => (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="tabular-nums">
        {sign}
        {money(cents)}
      </span>
    </div>
  );

  return (
    <section
      className="flex flex-col gap-3 rounded-[18px] border px-4 py-3.5 md:flex-row md:items-start md:gap-5 md:px-5"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span
          aria-hidden
          className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
          style={{ background: tone.dot, boxShadow: `0 0 0 4px ${tone.ring}` }}
        />
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.05em] uppercase" style={{ color: tone.ink, opacity: 0.8 }}>
            Livre esta semana
          </div>
          <div className="text-[18px] font-extrabold tracking-[-0.01em] text-(--text-primary)">{title}</div>
          <p className="mt-0.5 text-sm leading-relaxed" style={{ color: tone.ink }}>
            {message}
          </p>
          <p className="mt-1 text-[13px] text-(--text-muted)">
            {free.nextIncome ? (
              <>
                Próxima entrada: <b className="text-(--text-secondary)">{free.nextIncome.description}</b> · {day(free.nextIncome.date)}
              </>
            ) : (
              "Nenhuma entrada garantida nos próximos 60 dias. Marque o salário como “Entrada garantida” pra contar com ele."
            )}
          </p>
        </div>
      </div>
      <details className={`group shrink-0 rounded-[12px] bg-(--bg-surface) px-3.5 py-2.5 text-[12.5px] leading-[1.7] md:min-w-[300px]`} style={{ color: tone.ink }}>
        <summary className="cursor-pointer font-bold select-none">Como calculamos</summary>
        <div className="mt-1">
          {line("Disponível hoje", free.availableCents, free.availableCents < 0 ? "−" : "")}
          {line(`Entradas garantidas até ${day(free.until)}`, free.incomeCents, "+")}
          {line(`Saídas previstas até ${day(free.until)}`, free.outCents, "−")}
          {free.overdueOutCents > 0 ? line("Pagamentos atrasados", free.overdueOutCents, "−") : null}
          {line("Gastos estimados (limites das Metas)", free.estimatedCents, "−")}
          {hasFloor ? line("Piso de segurança", free.floorCents, "−") : null}
          <div className="mt-1 flex justify-between gap-4 border-t pt-1 font-extrabold" style={{ borderColor: tone.border }}>
            <span>Livre</span>
            <span className="tabular-nums">
              {free.freeCents < 0 ? "−" : ""}
              {money(free.freeCents)}
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-(--text-muted)">Entrada variável só conta depois que cai.</div>
        </div>
      </details>
    </section>
  );
}

const PILL_TEXT = { free: "Pode gastar", essentials: "Dá pra gastar com cuidado", short: "Segura até o essencial" } as const;

/**
 * O "Livre esta semana" em uma linha, pro card azul do Dashboard: a cor
 * do semáforo, o valor e uma frase curta. Leva pro Fluxo de caixa, onde
 * está a conta aberta.
 */
export function FreeThisWeekPill({ free, currency }: { free: FreeThisWeek; currency: CurrencyCode }) {
  return (
    <Link
      href="/fluxo-de-caixa"
      className="mt-3 inline-flex max-w-full items-center gap-2 self-start rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-white/25"
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/40"
        style={{ background: TONES[free.state].dot }}
      />
      <span className="truncate">
        Livre esta semana: {free.freeCents < 0 ? "−" : ""}
        <Money cents={Math.abs(free.freeCents)} currency={currency} />
        <span className="font-normal text-white/80"> · {PILL_TEXT[free.state]}</span>
      </span>
    </Link>
  );
}
