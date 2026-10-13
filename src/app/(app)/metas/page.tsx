import { CircleDollarSign, CreditCard, Lock, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { accountScope } from "@/lib/visibility";
import { loadGoals, type GoalView } from "@/lib/goals";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { themedPair } from "@/lib/theme-color";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { monthRange } from "@/lib/month";
import { Money } from "@/components/money";
import { NewGoalDialog, type GoalAccountOption, type GoalCategoryOption } from "./new-goal-dialog";
import { DepositButton, EditGoalButton, type GoalActionData } from "./goal-actions";
import { GoalSuggestions } from "./goal-suggestions";

const RING_COLORS = ["var(--primary)", "#27C499", "#A78BFA", "#FF8A5C"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthYear(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return `${name} de ${y}`;
}

function PaceChip({ pace }: { pace: GoalView["pace"] }) {
  if (!pace) return null;
  const [text, cls] =
    pace === "done"
      ? ["Concluída", "bg-(--income-soft) text-(--income-dark)"]
      : pace === "on_track"
        ? ["No ritmo", "bg-(--income-soft) text-(--income-dark)"]
        : ["Abaixo do ritmo", "bg-(--warning-badge) text-(--warning-dark)"];
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold ${cls}`}>{text}</span>;
}

function Ring({ progress, color }: { progress: number; color: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${Math.round(progress * 100)}% da meta`} className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-strong)" strokeWidth="10" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 44 44)" />
      <text x="44" y="49" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--text-primary)">
        {Math.round(progress * 100)}%
      </text>
    </svg>
  );
}

/**
 * Saldo devedor caindo: linha cheia até hoje, pontilhada até a data.
 * Com pouco tempo de meta (e sem data), uma linha não diz nada — fica uma
 * barra do quanto já foi pago, e o gráfico aparece com os meses.
 */
function DebtChart({ goal, currency }: { goal: GoalView; currency: CurrencyCode }) {
  const pts = goal.history;
  if (pts.length < 1) return null;
  const last = pts[pts.length - 1];
  const end = goal.target_date && goal.target_date > last.date ? goal.target_date : null;
  const t0 = Date.parse(pts[0].date);
  const t1 = Date.parse(end ?? last.date);
  const DAY = 86_400_000;

  if (t1 - t0 < 14 * DAY) {
    const paid = Math.max(0, goal.start_cents - goal.remainingCents);
    return (
      <div className="flex flex-col gap-3 rounded-[16px] bg-(--bg-subtle) p-5">
        <div className="flex items-baseline justify-between text-[13px] text-(--text-muted)">
          <span>Pago</span>
          <span className="font-semibold text-(--text-primary) tabular-nums">{Math.round(goal.progress * 100)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-(--bg-strong)">
          <div className="h-full rounded-full bg-(--income)" style={{ width: `${Math.min(100, goal.progress * 100)}%` }} />
        </div>
        <div className="flex justify-between text-xs text-(--text-muted)">
          <span>
            <Money cents={paid} currency={currency} /> pagos
          </span>
          <span>
            de <Money cents={goal.start_cents} currency={currency} />
          </span>
        </div>
        <p className="text-xs text-(--text-light)">A linha do saldo caindo aparece conforme os meses passam.</p>
      </div>
    );
  }

  const span = Math.max(1, t1 - t0);
  const max = Math.max(1, ...pts.map((p) => p.cents), goal.start_cents);
  const W = 480;
  const H = 150;
  const x = (d: string) => 28 + ((Date.parse(d) - t0) / span) * (W - 56);
  const y = (c: number) => 16 + (1 - c / max) * (H - 30);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.cents).toFixed(1)}`).join(" ");

  // Rótulos: começo, hoje e a data; some o que ficaria por cima de outro.
  const marks: { date: string; text: string; strong?: boolean; good?: boolean }[] = [];
  const fmt = (d: string) => {
    const [yy, mm] = d.split("-").map(Number);
    return `${MONTHS[mm - 1]}/${String(yy).slice(2)}`;
  };
  marks.push({ date: pts[0].date, text: fmt(pts[0].date) });
  marks.push({ date: last.date, text: "hoje", strong: true });
  if (end) marks.push({ date: end, text: fmt(end), good: true });
  const ticks = marks.filter((m, i) => !marks.some((o, j) => j > i && Math.abs(x(o.date) - x(m.date)) < 48));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={`Saldo devedor: ${formatCents(goal.start_cents, currency)} no começo, ${formatCents(goal.remainingCents, currency)} hoje`}>
      <line x1="0" y1={H} x2={W} y2={H} stroke="var(--border-soft)" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {end ? (
        <path d={`M${x(last.date).toFixed(1)} ${y(last.cents).toFixed(1)} L${x(end).toFixed(1)} ${y(0).toFixed(1)}`} fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray="6 7" strokeLinecap="round" />
      ) : null}
      <circle cx={x(last.date)} cy={y(last.cents)} r="6" fill="var(--primary)" />
      {end ? <circle cx={x(end)} cy={y(0)} r="6" fill="var(--bg-surface)" stroke="var(--income)" strokeWidth="3" /> : null}
      {ticks.map((m) => (
        <text
          key={`${m.date}-${m.text}`}
          x={x(m.date)}
          y={H + 16}
          fontSize="11"
          textAnchor="middle"
          fill={m.strong ? "var(--text-primary)" : m.good ? "var(--income-dark)" : "var(--text-light)"}
          fontWeight={m.strong || m.good ? 700 : 400}
        >
          {m.text}
        </text>
      ))}
    </svg>
  );
}

function actionData(g: GoalView, memberId: string): GoalActionData {
  return {
    id: g.id,
    kind: g.kind,
    name: g.name,
    target_cents: g.target_cents,
    target_date: g.target_date,
    tracking: g.tracking,
    owner_id: g.owner_id,
    visibility: g.visibility,
    mine: g.owner_id === memberId,
    deposits: g.deposits,
  };
}

export default async function MetasPage() {
  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();

  const [goals, balanceScope, { data: accountRows }, { data: categoryRows }, colorMap] = await Promise.all([
    loadGoals({ supabase, householdId, memberId, today }),
    accountScope(supabase, householdId, memberId, "balance"),
    supabase
      .from("accounts")
      .select("id, name, type, owner_id")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind, is_transfer")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .order("name"),
    getCategoryColorMap(supabase, householdId),
  ]);

  const visible = new Set(balanceScope.ids);
  const accounts: GoalAccountOption[] = (accountRows ?? [])
    .filter((a) => visible.has(a.id as string) && (a.owner_id === null || a.owner_id === memberId))
    .map((a) => ({ id: a.id as string, name: a.name as string, type: a.type as string, couple: a.owner_id === null, mine: a.owner_id === memberId }));
  const categories: GoalCategoryOption[] = (categoryRows ?? [])
    .filter((c) => c.kind === "expense" && !c.is_transfer)
    .map((c) => ({ id: c.id as string, name: c.name as string }));
  const formProps = { accounts, categories, currency: currency as CurrencyCode, today };

  const saves = goals.filter((g) => g.kind === "save");
  const limits = goals.filter((g) => g.kind === "limit");
  const debts = goals.filter((g) => g.kind === "debt");
  const shown = (list: GoalView[]) => list.filter((g) => !g.hidden);

  const savedTotal = shown(saves).reduce((n, g) => n + Math.max(0, g.savedCents), 0);
  const targetTotal = shown(saves).reduce((n, g) => n + (g.target_cents ?? 0), 0);
  const perMonth = shown(saves).reduce((n, g) => n + (g.pace !== "done" ? (g.perMonthCents ?? 0) : 0), 0);
  const limitsOk = limits.filter((g) => g.progress <= 1).length;
  const debtLeft = shown(debts).reduce((n, g) => n + g.remainingCents, 0);

  const [y, m, d] = today.split("-").map(Number);
  const daysLeft = Number(monthRange(y, m - 1).end.slice(8)) - d;
  const monthName = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });

  const missing = (["save", "limit", "debt"] as const).filter((k) => !goals.some((g) => g.kind === k));
  const kindLabel = { save: "juntar dinheiro", limit: "limite de gasto", debt: "quitar dívida" } as const;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <div className="flex items-start justify-between gap-3 sm:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-page-title">Metas</h1>
          <p className="text-page-subtitle max-sm:hidden">O que vocês querem juntar, até onde gastar e o que falta quitar.</p>
        </div>
        <NewGoalDialog {...formProps} />
      </div>

      {goals.length === 0 ? (
        <section className="rounded-[20px] bg-(--bg-surface) p-6 shadow-(--shadow-card) md:p-8">
          <h2 className="text-card-title">Comece por uma meta</h2>
          <p className="mt-1 text-sm text-(--text-muted)">Escolha o tipo. Dá pra ter quantas quiser, do casal ou só suas.</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {(
              [
                ["save", "Juntar dinheiro", "Viagem, reserva, entrada de casa. Mostra quanto guardar por mês.", CircleDollarSign, "var(--primary)"],
                ["limit", "Limite de gasto", "Até quanto gastar numa categoria. Avisa quando chega perto.", TrendingDown, "#E8590C"],
                ["debt", "Quitar dívida", "Zerar um cartão ou empréstimo. Acompanha o saldo caindo.", CreditCard, "var(--income-dark)"],
              ] as const
            ).map(([k, title, text, Icon, tone]) => (
              <NewGoalDialog
                key={k}
                {...formProps}
                defaultKind={k}
                trigger={
                  <button type="button" className="flex flex-col items-start gap-2 rounded-[16px] border-[1.5px] border-(--border-primary) p-4 text-left transition-colors hover:border-(--primary-border) hover:bg-(--primary-soft)">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[15px] font-bold text-(--text-primary)">{title}</span>
                    <span className="text-[13px] leading-snug text-(--text-muted)">{text}</span>
                  </button>
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-[24px] bg-(--primary) p-5 text-white md:px-8 md:py-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/velun-mark.png" alt="" aria-hidden className="pointer-events-none absolute -top-24 -right-28 h-[360px] w-[420px] object-contain opacity-[0.12]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm text-white/85">Guardado nas metas</div>
              <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[40px]">
                <Money cents={savedTotal} currency={currency} />
              </div>
              <div className="mt-1 text-[13px] text-white/80">
                {targetTotal > 0 ? (
                  <>
                    de <Money cents={targetTotal} currency={currency} /> · {saves.length} {saves.length === 1 ? "meta" : "metas"} de juntar
                  </>
                ) : (
                  "Nenhuma meta de juntar ainda"
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3 lg:min-w-[520px]">
              {[
                { label: "Pra guardar este mês", short: "Este mês", value: <Money cents={perMonth} currency={currency} /> },
                { label: "Limites no mês", short: "Limites", value: limits.length ? `${limitsOk} de ${limits.length} ok` : "—" },
                { label: "Falta quitar", short: "Falta quitar", value: <Money cents={debtLeft} currency={currency} /> },
              ].map((k) => (
                <div key={k.label} className="rounded-[12px] bg-white/15 px-2.5 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
                  <div className="text-[11px] text-white/85 md:text-xs">
                    <span className="md:hidden">{k.short}</span>
                    <span className="max-md:hidden">{k.label}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[14px] font-bold tabular-nums md:text-[20px]">{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {saves.length > 0 ? (
        <div>
          <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-card-title">Juntar dinheiro</h2>
            <span className="truncate text-[13px] text-(--text-muted) max-sm:hidden">Quanto falta e quanto guardar por mês pra chegar na data</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2">
            {saves.map((g, i) => (
              <article key={g.id} className="flex flex-col gap-4 rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:px-6">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-bold text-(--text-primary)">{g.name}</div>
                    <div className="truncate text-xs text-(--text-muted)">
                      {g.ownerLabel} · {g.tracking === "account" ? `saldo da ${g.accountName ?? "conta"}` : "valores guardados"}
                    </div>
                  </div>
                  <PaceChip pace={g.pace} />
                </div>
                {g.hidden ? (
                  <p className="flex items-center gap-2 text-sm text-(--text-muted)">
                    <Lock className="h-4 w-4" /> Segue uma conta que você não vê: o progresso fica com quem é dono.
                  </p>
                ) : (
                  <div className="flex items-center gap-4">
                    <Ring progress={g.progress} color={RING_COLORS[i % RING_COLORS.length]} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div>
                        <span className="text-[22px] font-bold tabular-nums text-(--text-primary)">
                          <Money cents={g.savedCents} currency={currency} />
                        </span>{" "}
                        <span className="text-[13px] text-(--text-muted)">
                          de <Money cents={g.target_cents ?? 0} currency={currency} />
                        </span>
                      </div>
                      <div className="text-[13px] text-(--text-secondary)">
                        {g.pace === "done" ? (
                          "Meta alcançada."
                        ) : g.perMonthCents ? (
                          <>
                            Guarde <b className="font-semibold"><Money cents={g.perMonthCents} currency={currency} />/mês</b> pra chegar lá.
                          </>
                        ) : (
                          <>
                            Faltam <Money cents={Math.max(0, (g.target_cents ?? 0) - g.savedCents)} currency={currency} />.
                          </>
                        )}
                      </div>
                      {g.target_date ? (
                        <div className="text-xs text-(--text-light)">
                          Até {monthYear(g.target_date)}
                          {g.monthsLeft ? ` · faltam ${g.monthsLeft} ${g.monthsLeft === 1 ? "mês" : "meses"}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                {g.suggestions.length > 0 ? <GoalSuggestions goalId={g.id} kind={g.kind} suggestions={g.suggestions} currency={currency} /> : null}
                {g.canEdit ? (
                  <div className="flex flex-wrap gap-2 border-t border-(--border-soft) pt-3.5">
                    {g.tracking === "deposits" ? <DepositButton goal={actionData(g, memberId)} today={today} currency={currency} /> : null}
                    <EditGoalButton goal={actionData(g, memberId)} currency={currency} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {limits.length > 0 ? (
        <div>
          <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-card-title">Limite de gasto</h2>
            <span className="text-[13px] text-(--text-muted) first-letter:uppercase">
              {monthName} · {daysLeft === 0 ? "último dia" : `faltam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`}
            </span>
          </div>
          <section className="rounded-[20px] bg-(--bg-surface) px-4 shadow-(--shadow-card) md:px-6">
            {limits.map((g) => {
              const limit = g.target_cents ?? 0;
              const over = g.progress > 1;
              const near = !over && g.progress >= 0.8;
              const bar = over ? "var(--expense)" : near ? "var(--warning)" : "var(--income)";
              const colors = themedPair(colorMap.get(g.categoryName ?? "") ?? MUTED_CATEGORY_COLOR);
              return (
                <div key={g.id} className="flex flex-col gap-3 border-b border-(--border-soft) py-4 last:border-0 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center md:gap-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] text-xs font-extrabold" style={{ background: colors.bg, color: colors.fg }}>
                      {(g.categoryName ?? g.name).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-(--text-primary)">{g.categoryName ?? g.name}</div>
                      <div className="truncate text-xs text-(--text-muted)">{g.ownerLabel}</div>
                    </div>
                    <span className="ml-auto text-right md:hidden">
                      <span className="text-[15px] font-bold tabular-nums" style={{ color: over ? "var(--expense-dark)" : undefined }}>
                        <Money cents={g.spentCents} currency={currency} />
                      </span>{" "}
                      <span className="text-[13px] text-(--text-light)">/ {formatCents(limit, currency)}</span>
                    </span>
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-(--bg-strong)">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, g.progress * 100)}%`, background: bar }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs" style={{ color: over ? "var(--expense-dark)" : "var(--text-muted)" }}>
                      <span>
                        {over ? (
                          <>Passou <Money cents={g.spentCents - limit} currency={currency} /></>
                        ) : (
                          <>
                            {near ? "Perto do limite · " : ""}sobra <Money cents={limit - g.spentCents} currency={currency} />
                          </>
                        )}
                      </span>
                      <span>{Math.round(g.progress * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <span className="max-md:hidden">
                      <span className="text-[15px] font-bold tabular-nums" style={{ color: over ? "var(--expense-dark)" : undefined }}>
                        <Money cents={g.spentCents} currency={currency} />
                      </span>{" "}
                      <span className="text-[13px] text-(--text-light)">/ {formatCents(limit, currency)}</span>
                    </span>
                    {g.canEdit ? <EditGoalButton goal={actionData(g, memberId)} currency={currency} /> : null}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      ) : null}

      {debts.length > 0 ? (
        <div>
          <div className="mx-1 mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-card-title">Quitar dívida</h2>
            <span className="text-[13px] text-(--text-muted) max-sm:hidden">O saldo devedor caindo até zerar</span>
          </div>
          <div className="flex flex-col gap-4 md:gap-5">
            {debts.map((g) => (
              <article key={g.id} className="grid grid-cols-1 items-center gap-5 rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-7">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-bold text-(--text-primary)">{g.name}</div>
                      <div className="truncate text-xs text-(--text-muted)">
                        {g.ownerLabel}
                        {g.tracking === "account" && g.accountName ? ` · ${g.accountName}` : ""}
                        {g.target_date ? ` · até ${monthYear(g.target_date)}` : ""}
                      </div>
                    </div>
                    <PaceChip pace={g.pace} />
                  </div>
                  {g.hidden ? (
                    <p className="flex items-center gap-2 text-sm text-(--text-muted)">
                      <Lock className="h-4 w-4" /> Segue um cartão que você não vê.
                    </p>
                  ) : (
                    <>
                      <div>
                        <span className="text-[26px] font-bold tabular-nums text-(--text-primary)">
                          <Money cents={g.remainingCents} currency={currency} />
                        </span>{" "}
                        <span className="text-[13px] text-(--text-muted)">{g.remainingCents > 0 ? "ainda devendo" : "quitada"}</span>
                      </div>
                      <div className="text-[13px] leading-relaxed text-(--text-secondary)">
                        Começou em <Money cents={g.start_cents} currency={currency} /> · já pagou{" "}
                        <Money cents={Math.max(0, g.start_cents - g.remainingCents)} currency={currency} /> ({Math.round(g.progress * 100)}%).
                        {g.perMonthCents ? (
                          <>
                            {" "}Pagando <b className="font-semibold"><Money cents={g.perMonthCents} currency={currency} />/mês</b>, zera na data.
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                  {g.suggestions.length > 0 ? <GoalSuggestions goalId={g.id} kind={g.kind} suggestions={g.suggestions} currency={currency} /> : null}
                  {g.canEdit ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {g.tracking === "deposits" ? <DepositButton goal={actionData(g, memberId)} today={today} currency={currency} /> : null}
                      <EditGoalButton goal={actionData(g, memberId)} currency={currency} />
                    </div>
                  ) : null}
                </div>
                {!g.hidden ? <DebtChart goal={g} currency={currency} /> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {goals.length > 0 && missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-(--border-strong) px-4 py-3.5">
          <span className="text-[13px] text-(--text-muted)">Também dá pra criar:</span>
          {missing.map((k) => (
            <NewGoalDialog
              key={k}
              {...formProps}
              defaultKind={k}
              trigger={
                <button type="button" className="h-9 rounded-full bg-(--primary-light) px-3.5 text-[13px] font-semibold text-(--primary) hover:opacity-90">
                  + {kindLabel[k]}
                </button>
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
