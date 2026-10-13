import { Fragment } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { buildPeriod, formatDateBr, isValidDate, shortMonth } from "@/lib/report-pdf/period";
import { buildReportData, type ReportCategoryRow, type ReportData } from "@/lib/report-pdf/data";
import { monthRange, parseMonthParam } from "@/lib/month";
import { PrintToolbar } from "./print-toolbar";

type Search = { from?: string; to?: string; mode?: string; accounts?: string; print?: string };

// O título da página vira o nome do arquivo ao salvar o PDF:
// "Velun - Relatório Setembro de 2026 - gerado em 13-10-2026".
// Sem barras (o navegador as troca por "_" no nome do arquivo).
export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { today } = await getCurrentMember();
  const sp = await searchParams;
  const { year, monthIndex } = parseMonthParam(undefined, today);
  const fallback = monthRange(year, monthIndex);
  const period = buildPeriod(
    isValidDate(sp.from) ? sp.from : fallback.start,
    isValidDate(sp.to) ? sp.to : fallback.end,
  );
  const dmy = (iso: string) => iso.split("-").reverse().join("-");
  const what = period.kind === "custom" ? `${dmy(period.from)} a ${dmy(period.to)}` : period.label;
  const resumo = sp.mode === "summary" ? " (resumo)" : "";
  // Só algumas contas: o nome delas (ou quantas) entra no arquivo.
  let contas = "";
  const ids = sp.accounts ? sp.accounts.split(",").filter(Boolean) : [];
  if (ids.length > 0) {
    if (ids.length > 2) contas = ` - ${ids.length} contas`;
    else {
      const supabase = await createClient();
      const { data } = await supabase.from("accounts").select("name").in("id", ids);
      const names = (data ?? []).map((a) => String(a.name).replace(/[\\/:*?"<>|]/g, " ").trim());
      if (names.length > 0) contas = ` - ${names.join(" e ")}`;
    }
  }
  return { title: `Velun - Relatório ${what}${contas}${resumo} - gerado em ${dmy(today)}` };
}

const TYPE_LABEL: Record<string, string> = {
  checking: "Conta",
  savings: "Poupança",
  investment: "Investimento",
  credit_card: "Cartão",
  cash: "Dinheiro",
};

function Delta({ now, prev, kind, currency }: { now: number; prev: number | null; kind: "out" | "in"; currency: CurrencyCode }) {
  if (prev === null) return <span className="text-[#3538CD]">novo</span>;
  const d = now - prev;
  if (d === 0) return <span className="text-[#98A2B3]">igual</span>;
  const good = kind === "out" ? d < 0 : d > 0;
  return (
    <span className={good ? "text-[#067647]" : "text-[#B42318]"}>
      {d > 0 ? "+" : "−"}
      {formatCents(Math.abs(d), currency)}
    </span>
  );
}

function pct(share: number) {
  const p = share * 100;
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
}

/** Rosca em SVG puro: imprime nítida e não depende de JavaScript. */
function Donut({ rows, total, label, currency }: { rows: ReportCategoryRow[]; total: number; label: string; currency: CurrencyCode }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const lens = rows.map((row) => (total > 0 ? (row.amount_cents / total) * c : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((n, v) => n + v, 0));
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`${label}: ${formatCents(total, currency)}`}>
      <g transform="rotate(-90 90 90)">
        {rows.map((row, i) => (
          <circle
            key={row.name}
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke={row.color}
            strokeWidth="26"
            strokeDasharray={`${lens[i]} ${c - lens[i]}`}
            strokeDashoffset={-starts[i]}
          />
        ))}
      </g>
      <text x="90" y="84" textAnchor="middle" fontSize="10" fill="#667085">
        {label}
      </text>
      <text x="90" y="102" textAnchor="middle" fontSize="15" fontWeight="800" fill="#111318">
        {formatCents(total, currency)}
      </text>
    </svg>
  );
}

function Bars({ data, multiMonth }: { data: ReportData["evolution"]; multiMonth: boolean }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const w = 700;
  const h = 130;
  const slot = w / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(14, slot / 2 - 2));
  const ticks = multiMonth ? data.map((_, i) => i) : data.map((_, i) => i).filter((i) => i % 7 === 0 || i === data.length - 1);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Entradas e saídas no período">
      <line x1="0" y1={h} x2={w} y2={h} stroke="#EAECF0" />
      {data.map((d, i) => {
        const x = i * slot + slot / 2;
        const hi = (d.income / max) * (h - 6);
        const ho = (d.expense / max) * (h - 6);
        return (
          <g key={d.label}>
            {hi > 0 ? <rect x={x - bw - 1} y={h - hi} width={bw} height={hi} rx="2" fill="#12B76A" /> : null}
            {ho > 0 ? <rect x={x + 1} y={h - ho} width={bw} height={ho} rx="2" fill="#F04438" /> : null}
          </g>
        );
      })}
      {ticks.map((i) => {
        const d = data[i];
        const label = multiMonth ? shortMonth(d.label) : `${Number(d.label.slice(8))}/${Number(d.label.slice(5, 7))}`;
        return (
          <text key={d.label} x={i * slot + slot / 2} y={h + 14} textAnchor="middle" fontSize="9" fill="#98A2B3">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function CategoryTable({
  rows,
  total,
  prevTotal,
  kind,
  prevLabel,
  currency,
}: {
  rows: ReportCategoryRow[];
  total: number;
  prevTotal: number;
  kind: "out" | "in";
  prevLabel: string;
  currency: CurrencyCode;
}) {
  return (
    <table className="rp-table">
      <thead>
        <tr>
          <th>Categoria</th>
          <th className="r">Valor</th>
          <th className="r">Do total</th>
          <th className="r">vs {prevLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.name}>
            <tr>
              <td>
                <span className="rp-dot" style={{ background: r.color }} />
                {r.name}
              </td>
              <td className="r num">{formatCents(r.amount_cents, currency)}</td>
              <td className="r num">{pct(r.share)}</td>
              <td className="r num">
                <Delta now={r.amount_cents} prev={r.prev_cents} kind={kind} currency={currency} />
              </td>
            </tr>
            {/* Subcategorias: uma linha cada, recuada, sem comparação. */}
            {(r.subs ?? []).map((s) => (
              <tr key={`${r.name}›${s.name}`} className="text-[#667085]">
                <td style={{ paddingLeft: 22, fontSize: 10.5 }}>{s.name}</td>
                <td className="r num" style={{ fontSize: 10.5 }}>{formatCents(s.amount_cents, currency)}</td>
                <td className="r num" style={{ fontSize: 10.5 }}>{pct(total > 0 ? s.amount_cents / total : 0)}</td>
                <td />
              </tr>
            ))}
          </Fragment>
        ))}
        <tr className="rp-total">
          <td>Total</td>
          <td className="r num">{formatCents(total, currency)}</td>
          <td className="r">100%</td>
          <td className="r num">
            <Delta now={total} prev={prevTotal} kind={kind} currency={currency} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default async function RelatorioPdfPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { householdId, memberId, currency, today, displayName, timezone } = await getCurrentMember();
  const supabase = await createClient();
  const sp = await searchParams;

  // Sem datas válidas: o mês corrente.
  const { year, monthIndex } = parseMonthParam(undefined, today);
  const fallback = monthRange(year, monthIndex);
  const period = buildPeriod(
    isValidDate(sp.from) ? sp.from : fallback.start,
    isValidDate(sp.to) ? sp.to : fallback.end,
  );
  const full = sp.mode !== "summary";
  const accountIds = sp.accounts ? sp.accounts.split(",").filter(Boolean) : null;

  const [data, { data: household }] = await Promise.all([
    buildReportData({ supabase, householdId, memberId, period, accountIds, full }),
    supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
  ]);

  const money = (c: number) => formatCents(c, currency);
  // Hora no fuso da casa (o servidor roda em UTC).
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date());
  const generated = `${formatDateBr(today)} às ${time}`;
  const { totals } = data;
  const hasPrev = totals.incomePrev !== 0 || totals.expensePrev !== 0;
  const sobra = totals.balance >= 0;
  const backMonth = period.from.slice(0, 7);
  const footerText = `Velun · ${period.label} · ${(household?.name as string | undefined) ?? "Casa"}`;

  return (
    <>
      <style>{`
        @page { size: letter; margin: 14mm 14mm 16mm;
          @bottom-left { content: ${JSON.stringify(footerText)}; font: 8.5pt Inter, sans-serif; color: #98A2B3; }
          @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8.5pt Inter, sans-serif; color: #98A2B3; }
        }
        .rp { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rp-sheet { background: #fff; max-width: 816px; margin: 24px auto; padding: 44px 52px; box-shadow: 0 10px 30px rgba(16,24,40,.08); border-radius: 12px; }
        @media print { .rp-sheet { margin: 0; padding: 0; box-shadow: none; border-radius: 0; max-width: none; } }
        .rp-sec { break-inside: avoid; margin-top: 26px; }
        .rp-page { break-before: page; }
        .rp h2 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -.01em; color: #111318; }
        .rp .sub { font-size: 11px; color: #667085; margin-top: 2px; }
        .rp-table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 10px; }
        .rp-table th { text-align: left; font-size: 9.5px; font-weight: 700; color: #98A2B3; text-transform: uppercase; letter-spacing: .05em; padding: 0 0 6px; border-bottom: 1px solid #EAECF0; }
        .rp-table td { padding: 5.5px 0; border-bottom: 1px solid #F2F4F7; color: #111318; vertical-align: top; }
        .rp-table tr { break-inside: avoid; }
        .rp-table .r { text-align: right; padding-left: 10px; }
        .rp-table .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rp-total td { font-weight: 800; border-bottom: 0; }
        .rp-dot { display: inline-block; width: 8px; height: 8px; border-radius: 99px; margin-right: 7px; vertical-align: middle; }
      `}</style>
      <PrintToolbar autoPrint={sp.print === "1"} backHref={`/relatorios?month=${backMonth}`} />
      <div className="rp rp-sheet font-sans text-[#111318]">
        <header className="flex items-center justify-between border-b-[1.5px] border-[#EAECF0] pb-3.5">
          {/* O mesmo logo da barra lateral do app (ícone oficial + "velun"). */}
          <div className="flex items-center gap-2.5 text-[18px] font-bold tracking-[-0.02em]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/velun-icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-[8px]" />
            velun
          </div>
          <div className="text-right text-[11px] leading-[1.5] text-[#667085]">
            <b className="text-[#111318]">Relatório financeiro · {period.label}</b>
            <br />
            {(household?.name as string | undefined) ?? "Casa"} · gerado por {displayName} em {generated}
          </div>
        </header>

        <section className="rp-sec grid grid-cols-[1.3fr_1fr_1fr] gap-4 rounded-[16px] bg-[#536DFE] px-5 py-4.5 text-white">
          <div>
            <div className="text-[11px] opacity-85">{sobra ? "Sobrou" : "Faltou"} no período</div>
            <div className="text-[28px] font-extrabold tracking-[-0.03em]">{money(Math.abs(totals.balance))}</div>
            {hasPrev ? (
              <div className="text-[11px] opacity-85">
                {totals.balancePrev < 0 ? `Faltaram ${money(-totals.balancePrev)}` : `Sobraram ${money(totals.balancePrev)}`} {period.prev.inLabel}.
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[11px] opacity-85">Entrou</div>
            <div className="text-[19px] font-extrabold">{money(totals.income)}</div>
            {hasPrev ? (
              <div className="text-[11px] opacity-85">
                {totals.income - totals.incomePrev >= 0 ? "+" : "−"}
                {money(Math.abs(totals.income - totals.incomePrev))} vs {period.prev.label}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[11px] opacity-85">Saiu</div>
            <div className="text-[19px] font-extrabold">{money(totals.expense)}</div>
            {hasPrev ? (
              <div className="text-[11px] opacity-85">
                {totals.expense - totals.expensePrev >= 0 ? "+" : "−"}
                {money(Math.abs(totals.expense - totals.expensePrev))} vs {period.prev.label}
              </div>
            ) : null}
          </div>
        </section>

        {data.insight ? (
          <section className="rp-sec rounded-[14px] bg-[#F5F6FF] px-4 py-3.5 text-[12px] leading-[1.6] text-[#344054]">
            <b className="text-[#3538CD]">Insight Velun. </b>
            {data.insight.headline.map((p) => (typeof p === "string" ? p : money(p.cents))).join("")}{" "}
            {data.insight.items.map((it) => it.parts.map((p) => (typeof p === "string" ? p : money(p.cents))).join("")).join(" ")}
          </section>
        ) : null}

        <section className="rp-sec">
          <h2>Despesas por categoria</h2>
          <div className="sub">Quanto saiu em cada categoria, a fatia do total e a diferença {period.kind === "month" ? `pra ${period.prev.label}` : `pro ${period.prev.label}`}.</div>
          {data.expense.length === 0 ? (
            <p className="mt-3 text-[12px] text-[#667085]">Nenhuma despesa no período.</p>
          ) : (
            <div className="mt-2 grid grid-cols-[190px_minmax(0,1fr)] items-start gap-6">
              <Donut rows={data.expense} total={totals.expense} label="saiu" currency={currency} />
              <CategoryTable rows={data.expense} total={totals.expense} prevTotal={totals.expensePrev} kind="out" prevLabel={period.prev.label} currency={currency} />
            </div>
          )}
        </section>

        <section className="rp-sec">
          <h2>Receitas por categoria</h2>
          {data.income.length === 0 ? (
            <p className="mt-3 text-[12px] text-[#667085]">Nenhuma receita no período.</p>
          ) : (
            <CategoryTable rows={data.income} total={totals.income} prevTotal={totals.incomePrev} kind="in" prevLabel={period.prev.label} currency={currency} />
          )}
        </section>

        <section className="rp-sec">
          <h2>{period.multiMonth ? "Evolução mês a mês" : "Evolução do período"}</h2>
          <div className="sub">
            <span className="rp-dot" style={{ background: "#12B76A" }} />
            entradas e <span className="rp-dot ml-1" style={{ background: "#F04438" }} />
            saídas {period.multiMonth ? "de cada mês" : "de cada dia"}.
          </div>
          <div className="mt-3">
            <Bars data={data.evolution} multiMonth={period.multiMonth} />
          </div>
        </section>

        <section className="rp-sec">
          <h2>Contas</h2>
          <div className="sub">Saldo no começo e no fim do período, a partir dos lançamentos confirmados. Transferências entre contas entram aqui.</div>
          <table className="rp-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th className="r">Em {formatDateBr(period.from)}</th>
                <th className="r">Entrou</th>
                <th className="r">Saiu</th>
                <th className="r">Em {formatDateBr(period.to)}</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.name}>
                  <td>
                    {a.name} <span className="text-[10px] text-[#98A2B3]">· {TYPE_LABEL[a.type] ?? "Conta"}</span>
                  </td>
                  <td className="r num">{money(a.start)}</td>
                  <td className="r num text-[#067647]">+{money(a.inflow)}</td>
                  <td className="r num text-[#B42318]">−{money(a.outflow)}</td>
                  <td className="r num font-bold">{money(a.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {data.upcoming.length > 0 ? (
          <section className="rp-sec">
            <h2>A vencer nos 31 dias seguintes</h2>
            <div className="sub">Pendentes e recorrências depois de {formatDateBr(period.to)}.</div>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Vence</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Categoria</th>
                  <th className="r">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((u, i) => (
                  <tr key={`${u.date}-${i}`}>
                    <td className="num">{formatDateBr(u.date).slice(0, 5)}</td>
                    <td>{u.description}</td>
                    <td>{u.account_name}</td>
                    <td>{u.category_name}</td>
                    <td className={`r num ${u.direction === "in" ? "text-[#067647]" : "text-[#B42318]"}`}>
                      {u.direction === "in" ? "+" : "−"}
                      {money(u.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {data.byMonth ? (
          <>
            {(["expense", "income"] as const).map((k) => {
              const rows = data.byMonth![k];
              const monthTotals = k === "expense" ? data.byMonth!.expenseTotals : data.byMonth!.incomeTotals;
              if (rows.length === 0) return null;
              return (
                <section key={k} className="rp-sec rp-page">
                  <h2>{k === "expense" ? "Despesas" : "Receitas"} por categoria e mês</h2>
                  <div className="sub">Cada célula é o total confirmado da categoria no mês.</div>
                  <table className="rp-table" style={{ fontSize: period.months.length > 9 ? 9 : 10.5 }}>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        {period.months.map((m) => (
                          <th key={m} className="r">
                            {shortMonth(m)}
                          </th>
                        ))}
                        <th className="r">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.name}>
                          <td>{r.name}</td>
                          {r.values.map((v, i) => (
                            <td key={i} className="r num">
                              {v === 0 ? "—" : formatCents(v, currency).replace(/\.\d{2}$|,\d{2}$/, "")}
                            </td>
                          ))}
                          <td className="r num font-bold">{money(r.total)}</td>
                        </tr>
                      ))}
                      <tr className="rp-total">
                        <td>Total do mês</td>
                        {monthTotals.map((v, i) => (
                          <td key={i} className="r num">
                            {formatCents(v, currency).replace(/\.\d{2}$|,\d{2}$/, "")}
                          </td>
                        ))}
                        <td className="r num">{money(monthTotals.reduce((n, v) => n + v, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              );
            })}
          </>
        ) : null}

        {data.detail ? (
          <section className="rp-sec rp-page" style={{ breakInside: "auto" }}>
            <h2>Detalhamento por categoria</h2>
            <div className="sub">Todos os lançamentos do período, da maior categoria pra menor — despesas, depois receitas.</div>
            {data.detail.map((g) => (
              <div key={`${g.direction}-${g.name}`} className="mt-5" style={{ breakInside: g.rows.length <= 12 ? "avoid" : "auto" }}>
                <div className="flex items-baseline justify-between pb-1" style={{ borderBottom: `1.5px solid ${g.color}` }}>
                  <span className="text-[13px] font-extrabold">
                    <span className="rp-dot" style={{ background: g.color }} />
                    {g.name}
                    <span className="ml-2 text-[10px] font-semibold text-[#98A2B3]">{g.direction === "in" ? "receita" : "despesa"}</span>
                  </span>
                  <span className="text-[12px] font-extrabold tabular-nums">{money(g.total_cents)}</span>
                </div>
                <table className="rp-table" style={{ marginTop: 2 }}>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="num" style={{ width: 52 }}>
                          {formatDateBr(r.date).slice(0, period.multiMonth ? 10 : 5)}
                        </td>
                        <td>
                          {r.description}
                          {r.sub ? <span className="ml-1.5 text-[#98A2B3]">· {r.sub}</span> : null}
                        </td>
                        <td className="text-[#667085]">{r.account_name}</td>
                        <td className="r num">{money(r.amount_cents)}</td>
                      </tr>
                    ))}
                    {g.hidden_cents > 0 ? (
                      <tr>
                        <td />
                        <td colSpan={2} className="text-[#667085]">
                          De contas pessoais que mostram só o total
                        </td>
                        <td className="r num">{money(g.hidden_cents)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ) : null}

        <section className="rp-sec rounded-[12px] bg-[#F9FAFB] px-3.5 py-3 text-[11px] leading-[1.55] text-[#475467]">
          <b>Sobre este relatório.</b> Lançamentos confirmados de {formatDateBr(period.from)} a {formatDateBr(period.to)}, em{" "}
          {currency}. Contas: {data.accountNames.join(", ") || "nenhuma"}. Transferências entre contas não entram em receitas e
          despesas.
          {data.hiddenAccountsNote ? " Contas pessoais de outra pessoa que mostram só o total entram nos totais por categoria, sem lançamento a lançamento." : ""}
        </section>
      </div>
    </>
  );
}
