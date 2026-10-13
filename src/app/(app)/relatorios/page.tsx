import type { ReactNode } from "react";
import Link from "next/link";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getCategoryColorMap, MUTED_CATEGORY_COLOR } from "@/lib/category-colors";
import { monthRange, shiftMonth, monthParam, monthLabel, shortMonthLabel, parseMonthParam } from "@/lib/month";
import { fetchMonthTransactions } from "@/lib/month-transactions";
import { accountScope } from "@/lib/visibility";
import {
  buildReportInsight,
  categoryDeltas,
  dailySeries,
  excludeTransfers,
  sumByDirection,
} from "@/lib/reports";
import { MonthSelector } from "@/components/month-selector";
import { ReportViewToggle, type ReportView } from "./report-view-toggle";
import { ReportPdfButton } from "./report-pdf-button";
import { AccountFilter } from "@/components/account-filter";
import { CategoryBreakdown } from "./category-breakdown";
import { PeriodEvolutionChart } from "./period-evolution-chart";
import { InsightVelunCard } from "./bottom-cards";
import { Money } from "@/components/money";

function CardSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[20px] ${className}`}
      style={{ background: "var(--bg-surface)", boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; account?: string }>;
}) {
  const { householdId, memberId, currency, today } = await getCurrentMember();
  const supabase = await createClient();
  const { month, view: viewParam, account: accountParam } = await searchParams;
  const view: ReportView = viewParam === "a-vencer" ? "a-vencer" : "realizado";
  const { year, monthIndex } = parseMonthParam(month, today);

  const { start, end } = monthRange(year, monthIndex);
  const prev = shiftMonth(year, monthIndex, -1);
  const prevRange = monthRange(prev.year, prev.monthIndex);
  const next = shiftMonth(year, monthIndex, 1);

  const status = view === "a-vencer" ? "pending" : "cleared";

  // Relatórios agregam por categoria, então entram as contas pessoais a
  // partir de `categories_only`. Uma promise só, reusada pelas duas buscas.
  const fullScope = accountScope(supabase, householdId, memberId, "categories");
  // Filtro de conta (?account=): só estreita o que já entra no relatório.
  const categoriesScope = fullScope.then((scope) =>
    accountParam && scope.ids.includes(accountParam)
      ? { ids: [accountParam], excludedCount: 0 }
      : scope,
  );

  const [rows, prevRows, colorMap, { data: pdfAccounts }] = await Promise.all([
    categoriesScope.then((scope) =>
      fetchMonthTransactions(supabase, householdId, start, end, scope, status),
    ),
    categoriesScope.then((scope) =>
      fetchMonthTransactions(supabase, householdId, prevRange.start, prevRange.end, scope, status),
    ),
    getCategoryColorMap(supabase, householdId),
    // Contas que podem entrar no PDF: as mesmas que entram nos totais.
    fullScope.then((scope) =>
      supabase
        .from("accounts")
        .select("id, name, type, institution")
        .eq("household_id", householdId)
        .in("id", scope.ids.length > 0 ? scope.ids : ["00000000-0000-0000-0000-000000000000"])
        .order("sort_order")
        .order("name"),
    ),
  ]);

  const current = excludeTransfers(rows);
  const previous = excludeTransfers(prevRows);

  const totalIncome = sumByDirection(current, "in");
  const totalExpense = sumByDirection(current, "out");
  const balance = totalIncome - totalExpense;

  const totalIncomePrev = sumByDirection(previous, "in");
  const totalExpensePrev = sumByDirection(previous, "out");
  const balancePrev = totalIncomePrev - totalExpensePrev;

  const expenseDeltas = categoryDeltas(current, previous, "out");
  const incomeDeltas = categoryDeltas(current, previous, "in");
  const withColor = (d: (typeof expenseDeltas)[number]) => ({
    ...d,
    color: (colorMap.get(d.name) ?? MUTED_CATEGORY_COLOR).fg,
  });

  const evolution = dailySeries(current, start, end);
  const monthName = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long" });
  const prevName = new Date(prev.year, prev.monthIndex, 1).toLocaleDateString("pt-BR", { month: "long" });

  const insight = buildReportInsight({
    income: totalIncome,
    expense: totalExpense,
    balance,
    incomePrev: totalIncomePrev,
    expensePrev: totalExpensePrev,
    balancePrev,
    expenseDeltas,
    prevName,
  });

  const accountFilter =
    accountParam && (pdfAccounts ?? []).some((a) => a.id === accountParam) ? accountParam : null;
  const viewQuery = `${view === "a-vencer" ? "&view=a-vencer" : ""}${accountFilter ? `&account=${accountFilter}` : ""}`;
  const monthQS = monthParam(year, monthIndex);
  const expenseEmpty = view === "a-vencer" ? "Nenhuma despesa pendente neste mês." : "Nenhuma despesa neste mês.";
  const incomeEmpty = view === "a-vencer" ? "Nenhuma receita pendente neste mês." : "Nenhuma receita neste mês.";
  const isPeriodEmpty = current.length === 0;
  const hasPrev = totalIncomePrev !== 0 || totalExpensePrev !== 0;

  // Sem categoria demais e o relatório não diz pra onde foi o dinheiro.
  const uncategorized = expenseDeltas.find((d) => d.name === "Sem categoria")?.amount_cents ?? 0;
  const uncategorizedShare = totalExpense > 0 ? Math.round((uncategorized / totalExpense) * 100) : 0;
  const showUncategorized = uncategorizedShare > 20;

  const heroLabel =
    view === "a-vencer"
      ? balance >= 0 ? `Deve sobrar em ${monthName}` : `Deve faltar em ${monthName}`
      : balance >= 0 ? `Sobrou em ${monthName}` : `Faltou em ${monthName}`;
  const swing = balance - balancePrev;
  const heroNote = !hasPrev
    ? null
    : balancePrev < 0 && balance >= 0
      ? <>Em {prevName} faltaram <Money cents={-balancePrev} currency={currency} /> — virou o jogo em <Money cents={swing} currency={currency} />.</>
      : swing === 0
        ? <>Igual a {prevName}.</>
        : <><Money cents={Math.abs(swing)} currency={currency} /> {swing > 0 ? "a mais" : "a menos"} que em {prevName}.</>;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Relatórios</h1>
          <p className="text-page-subtitle max-sm:hidden">
            {view === "a-vencer"
              ? "O que ainda vai vencer ou entrar, por categoria."
              : "Pra onde o dinheiro foi e de onde veio."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {(pdfAccounts ?? []).length > 1 ? (
            <AccountFilter
              value={accountFilter}
              accounts={(pdfAccounts ?? []).map((a) => ({
                id: a.id as string,
                name: a.name as string,
                type: a.type as string,
                institution: (a.institution as string | null) ?? null,
              }))}
            />
          ) : null}
          <ReportPdfButton
            key={accountFilter ?? "todas"}
            month={monthQS}
            today={today}
            accounts={(pdfAccounts ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))}
            initialAccounts={accountFilter ? [accountFilter] : null}
          />
          <ReportViewToggle view={view} />
          <MonthSelector
            label={monthLabel(year, monthIndex)}
            prevHref={`/relatorios?month=${monthParam(prev.year, prev.monthIndex)}${viewQuery}`}
            nextHref={`/relatorios?month=${monthParam(next.year, next.monthIndex)}${viewQuery}`}
            month={monthParam(year, monthIndex)}
            today={today}
          />
        </div>
      </div>

      {showUncategorized && !isPeriodEmpty ? (
        <div className="flex flex-col gap-3 rounded-[16px] bg-(--warning-banner) px-4 py-3.5 md:flex-row md:items-center md:gap-4 md:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-(--warning-dark)" />
            <p className="text-sm leading-relaxed text-(--warning-ink)">
              <b>
                {uncategorizedShare}% das despesas de {monthName} estão sem categoria (
                <Money cents={uncategorized} currency={currency} />
                ).
              </b>{" "}
              <span className="max-md:hidden">Enquanto isso, o relatório não consegue dizer pra onde foi a maior parte do dinheiro.</span>
            </p>
          </div>
          <Link
            href={`/transacoes?month=${monthQS}&category=none${accountFilter ? `&account=${accountFilter}` : ""}`}
            className="flex h-9 shrink-0 items-center self-start rounded-[11px] bg-[#B54708] px-3.5 text-[13px] font-semibold whitespace-nowrap text-white max-md:ml-8 md:self-auto"
          >
            Categorizar agora
          </Link>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[24px] bg-(--primary) p-5 text-white md:px-8 md:py-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/velun-mark.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-28 h-[360px] w-[420px] object-contain opacity-[0.12] md:-top-28 md:-right-24 md:h-[420px] md:w-[520px]"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <div className="text-sm text-white/80">{heroLabel}</div>
            <div className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums md:text-[44px]">
              <Money cents={Math.abs(balance)} currency={currency} />
            </div>
            {heroNote ? <div className="mt-1 text-[13px] text-white/80 max-md:hidden">{heroNote}</div> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 md:gap-3 lg:min-w-[380px]">
            {[
              { label: view === "a-vencer" ? "Vai entrar" : "Entrou", cents: totalIncome, prevCents: totalIncomePrev },
              { label: view === "a-vencer" ? "Vai sair" : "Saiu", cents: totalExpense, prevCents: totalExpensePrev },
            ].map((k) => (
              <div key={k.label} className="rounded-[12px] bg-white/15 px-3 py-2.5 md:rounded-[16px] md:px-4 md:py-3.5">
                <div className="text-[11px] text-white/80 md:text-xs">{k.label}</div>
                <div className="mt-0.5 truncate text-[15px] font-bold tabular-nums md:text-[20px]">
                  <Money cents={k.cents} currency={currency} />
                </div>
                {hasPrev ? (
                  <div className="text-[11px] text-white/75 max-md:hidden">
                    {shortMonthLabel(prev.year, prev.monthIndex)}: <Money cents={k.prevCents} currency={currency} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {isPeriodEmpty ? (
        <CardSurface className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="max-w-[420px] text-sm text-(--text-secondary)">
            Ainda não há dados suficientes neste período. Adicione transações ou altere o mês
            selecionado para visualizar seus relatórios.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/transacoes"
              className="rounded-full px-4 py-2 text-[12px] font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Ir para transações
            </Link>
            <Link
              href={`/relatorios?month=${monthParam(prev.year, prev.monthIndex)}${viewQuery}`}
              className="rounded-full border px-4 py-2 text-[12px] font-semibold text-(--text-secondary)"
              style={{ borderColor: "var(--border-primary)" }}
            >
              Mudar período
            </Link>
          </div>
        </CardSurface>
      ) : (
        <>
          <CategoryBreakdown
            expense={expenseDeltas.map(withColor)}
            income={incomeDeltas.map(withColor)}
            prevLabel={prevName}
            currency={currency}
            emptyExpense={expenseEmpty}
            emptyIncome={incomeEmpty}
            month={monthQS}
            accountId={accountFilter}
            status={status}
            prevTotalExpense={totalExpensePrev}
            prevTotalIncome={totalIncomePrev}
          />

          <CardSurface className="p-4 md:p-6">
            <div className="mb-1 flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-3">
              <div>
                <h2 className="text-card-title">Evolução do mês</h2>
                <p className="mt-0.5 text-[13px] text-(--text-muted)">
                  Entradas e saídas de cada dia, e quanto sobrou até ali.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-(--text-secondary)">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#22C55E" }} /> Receitas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#F04469" }} /> Despesas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: "#3B82F6" }} /> Acumulado
                </span>
              </div>
            </div>
            <div className="mt-3">
              <PeriodEvolutionChart points={evolution} currency={currency} />
            </div>
          </CardSurface>

          <InsightVelunCard
            insight={insight}
            currency={currency}
            subtitle={hasPrev ? `O que mudou em ${monthName}, comparado com ${prevName}.` : `O resumo de ${monthName}.`}
          />
        </>
      )}
    </div>
  );
}
