import type { CurrencyCode } from "@/lib/money";
import type { BuiltEmail, EmailKind } from "./context";
import { EMAIL_KIND_LABEL } from "./context";
import {
  C,
  bar,
  block,
  box,
  button,
  dayLead,
  esc,
  grid,
  heading,
  itemRow,
  link,
  paragraph,
  sectionTitle,
  shell,
  stats,
  strong,
  table,
} from "./layout";
import {
  balance,
  capitalize,
  dayNumber,
  ddmm,
  longDate,
  money,
  moneyShort,
  monthName,
  plural,
  rangeLabel,
  signed,
  weekdayDate,
  weekdayShort,
} from "./format";
import type { WeekSummary } from "./week";
import { weekSubject } from "./week";
import type { AlertSummary } from "./alerts";
import type { MonthSummary } from "./month";
import type { UpcomingItem } from "./upcoming";
import { addDaysISO } from "@/lib/today";

// HTML e texto puro de cada e-mail. Sem banco: recebe os resumos prontos.

export type RenderBase = {
  firstName: string;
  householdName: string;
  shared: boolean;
  currency: CurrencyCode;
  siteUrl: string;
  unsubscribeUrl: string | null;
};

const SCHEDULE: Record<EmailKind, string> = {
  weekly: "toda segunda, às 8h",
  monthly: "no dia 1 de cada mês, às 8h",
  alerts: "às 8h, nos dias em que algo vence ou atrasa",
};

function footer(kind: EmailKind, base: RenderBase, privacy: boolean): string {
  const lines = [
    `Você recebe isto ${SCHEDULE[kind]}, porque está na casa ${strong(base.householdName, C.soft)} no Velun.`,
  ];
  if (privacy && base.shared) {
    lines.push("Só aparece o que você vê no Velun: conta pessoal que a outra pessoa escondeu fica de fora.");
  }
  const links = [link("Ajustar e-mails", `${base.siteUrl}/configuracoes#emails`)];
  if (base.unsubscribeUrl) links.push(link(`Parar de receber ${EMAIL_KIND_LABEL[kind]}`, base.unsubscribeUrl));
  lines.push(links.join(" · "));
  return lines.join("<br>");
}

function textFooter(kind: EmailKind, base: RenderBase): string {
  return [
    "",
    "—",
    `Você recebe isto ${SCHEDULE[kind]}, porque está na casa ${base.householdName} no Velun.`,
    `Ajustar e-mails: ${base.siteUrl}/configuracoes#emails`,
    base.unsubscribeUrl ? `Parar de receber ${EMAIL_KIND_LABEL[kind]}: ${base.unsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function itemMeta(i: UpcomingItem): string {
  return [i.accountName, i.categoryName].filter(Boolean).join(" · ");
}

function itemAmount(i: UpcomingItem, currency: CurrencyCode): { amount: string; color: string } {
  // Transferência entre contas da casa: nem gasto nem receita.
  if (i.transfer) return { amount: money(i.amountCents, currency), color: C.soft };
  return i.direction === "in"
    ? { amount: signed(i.amountCents, currency), color: C.in }
    : { amount: signed(-i.amountCents, currency), color: C.out };
}

// ---------------------------------------------------------------------------
// Resumo da semana
// ---------------------------------------------------------------------------

export function renderWeekly(w: WeekSummary, base: RenderBase): BuiltEmail {
  const cur = base.currency;
  const subject = weekSubject(w, cur, moneyShort);
  const sunday = weekdayDate(w.end);
  const sundayLabel = capitalize(sunday.split(",")[0]);

  const headline =
    w.outCents === 0 && w.inCents === 0
      ? `Bom dia, ${base.firstName}. Nada novo previsto pra esta semana.`
      : `Bom dia, ${base.firstName}. Esta semana ${[
          w.outCents > 0 ? `sai ${moneyShort(w.outCents, cur)}` : null,
          w.inCents > 0 ? `entra ${moneyShort(w.inCents, cur)}` : null,
        ]
          .filter(Boolean)
          .join(" e ")}.`;

  const body: string[] = [];
  body.push(
    block(
      heading(headline) +
        paragraph(
          `Se tudo cair como previsto, ${base.shared ? "a casa chega" : "você chega"} ${esc(sundayLabel.toLowerCase())} com ${strong(balance(w.endTotalCents, cur))}${w.overdue.length > 0 ? ", contando as atrasadas" : ""}.`,
        ),
      24,
    ),
  );
  body.push(
    block(
      stats([
        { label: "Vai sair", value: signed(-w.outCents, cur), color: C.out, bg: C.outSoft },
        { label: "Vai entrar", value: signed(w.inCents, cur), color: C.in, bg: C.inSoft },
        { label: `${sundayLabel}, ${ddmm(w.end)}`, value: balance(w.endTotalCents, cur), color: C.text, bg: C.bg },
      ]),
      18,
    ),
  );

  if (w.accounts.length > 0) {
    const negatives = w.accounts.filter((a) => a.negative);
    body.push(
      block(
        sectionTitle("Conta por conta") +
          grid({
            head: ["Conta", "Hoje", "Na semana", sundayLabel],
            rows: w.accounts.map((a) => ({
              cells: [
                { html: esc(a.name) },
                { html: esc(balance(a.todayCents, cur)), color: a.todayCents < 0 ? C.out : C.text },
                {
                  html: esc(a.deltaCents === 0 ? "—" : signed(a.deltaCents, cur)),
                  color: a.deltaCents < 0 ? C.out : a.deltaCents > 0 ? C.in : C.faint,
                },
                { html: esc(balance(a.endCents, cur)), color: a.endCents < 0 ? C.out : C.text, bold: true },
              ],
            })),
          }) +
          negatives
            .map((a) => {
              const n = a.negative!;
              const when =
                n.date === w.start
                  ? `${strong(`${a.name} já fica negativa hoje`, C.outText)}${w.overdue.length > 0 ? ", contando as atrasadas" : ""}.`
                  : `${strong(`${a.name} fica negativa ${weekdayDate(n.date)}`, C.outText)}${n.cause ? `, quando cai ${esc(n.cause)}` : ""}.`;
              const advice =
                n.date === w.start
                  ? ` Passe pelo menos ${strong(money(n.shortCents, cur), C.outText)} pra ela hoje pra não pagar taxa.`
                  : ` Passe pelo menos ${strong(money(n.shortCents, cur), C.outText)} pra ela até ${esc(weekdayDate(addDaysISO(n.date, -1)).split(",")[0])} pra não pagar taxa.`;
              return `<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>${box(
                `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.outText}">${when}${advice}</div>`,
                C.outSoft,
                "12px 14px",
              )}`;
            })
            .join(""),
        24,
      ),
    );
  }

  if (w.overdue.length > 0) {
    body.push(
      block(
        box(
          `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:700;color:${C.warn}">${esc(
            plural(w.overdue.length, "lançamento atrasado", "lançamentos atrasados"),
          )}</div>` +
            table(
              w.overdue
                .map((i, idx) => {
                  const a = itemAmount(i, cur);
                  return itemRow({
                    name: i.description,
                    meta: `${i.accountName} · ${i.direction === "in" ? "era pra" : "venceu"} ${weekdayDate(i.date)}`,
                    amount: a.amount,
                    amountColor: a.color,
                    border: idx > 0,
                  });
                })
                .join(""),
            ) +
            `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:${C.warn};margin-top:6px">Já pagou ou já caiu? Marque no Velun e ele sai daqui.</div>`,
          C.warnSoft,
          "14px 16px 12px",
        ),
        18,
      ),
    );
  }

  if (w.days.length > 0) {
    const rows = w.days
      .flatMap((d) =>
        d.items.map((i, idx) => {
          const a = itemAmount(i, cur);
          return itemRow({
            lead: idx === 0 ? dayLead(dayNumber(d.date), weekdayShort(d.date)) : "",
            name: i.description,
            meta: itemMeta(i),
            amount: a.amount,
            amountColor: a.color,
            border: idx === 0,
          });
        }),
      )
      .join("");
    body.push(block(sectionTitle("Dia a dia") + table(rows), 24));
  } else {
    body.push(block(paragraph("Nenhuma conta nem recebimento previsto pros próximos 7 dias.", { top: 0 }), 22));
  }

  body.push(block(button("Abrir A vencer", `${base.siteUrl}/a-pagar`), 24));

  const html = shell({
    title: subject,
    preheader: `Domingo: ${balance(w.endTotalCents, cur)}${w.overdue.length ? ` · ${plural(w.overdue.length, "atrasada", "atrasadas")}` : ""}`,
    tag: rangeLabel(w.start, w.end),
    body: body.join("\n"),
    footer: footer("weekly", base, true),
    siteUrl: base.siteUrl,
  });

  const text = [
    headline,
    `${sundayLabel}, ${ddmm(w.end)}: ${balance(w.endTotalCents, cur)}`,
    "",
    ...(w.accounts.length
      ? [
          "Conta por conta:",
          ...w.accounts.map(
            (a) =>
              `- ${a.name}: hoje ${balance(a.todayCents, cur)}, ${sundayLabel.toLowerCase()} ${balance(a.endCents, cur)}${a.negative ? ` (fica negativa ${weekdayDate(a.negative.date)})` : ""}`,
          ),
          "",
        ]
      : []),
    ...(w.overdue.length
      ? ["Atrasados:", ...w.overdue.map((i) => `- ${ddmm(i.date)} ${i.description}: ${itemAmount(i, cur).amount}`), ""]
      : []),
    ...(w.days.length
      ? [
          "Dia a dia:",
          ...w.days.flatMap((d) => d.items.map((i) => `- ${weekdayShort(d.date)} ${ddmm(d.date)} ${i.description}: ${itemAmount(i, cur).amount}`)),
          "",
        ]
      : []),
    `Abrir A vencer: ${base.siteUrl}/a-pagar`,
    textFooter("weekly", base),
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Aviso de vencimento
// ---------------------------------------------------------------------------

export function renderAlerts(a: AlertSummary, base: RenderBase, today: string): BuiltEmail {
  const cur = base.currency;
  const total = a.dueTomorrow.reduce((s, i) => s + i.amountCents, 0);
  const late = a.overdue.length;
  const lateText = late > 0 ? plural(late, "atrasada", "atrasadas") : "";

  let subject: string;
  if (a.dueTomorrow.length === 1) {
    subject = `Amanhã vence ${a.dueTomorrow[0].description}, ${money(total, cur)}`;
  } else if (a.dueTomorrow.length > 1) {
    subject = `Amanhã vencem ${a.dueTomorrow.length} contas, ${money(total, cur)}`;
  } else {
    const newest = [...a.overdue].sort((x, y) => y.date.localeCompare(x.date))[0];
    subject = `Ficou atrasado: ${newest.description}, ${money(newest.amountCents, cur)}`;
  }
  if (a.dueTomorrow.length > 0 && late > 0) subject += ` · ${lateText}`;
  else if (a.dueTomorrow.length === 0 && late > 1) subject += ` · ${lateText} no total`;

  const headline =
    a.dueTomorrow.length > 0
      ? `Amanhã ${a.dueTomorrow.length === 1 ? "vence 1 conta" : `vencem ${a.dueTomorrow.length} contas`}${late > 0 ? `, e ${plural(late, "lançamento está atrasado", "lançamentos estão atrasados")}` : ""}.`
      : `${plural(late, "lançamento está atrasado", "lançamentos estão atrasados")}.`;

  const body: string[] = [];
  body.push(
    block(
      heading(headline) +
        paragraph(
          a.groups.length > 1
            ? "Separado por conta, com o saldo de hoje, pra você ver de onde sai cada um."
            : "Com o saldo de hoje da conta, pra você ver se dá pra pagar.",
        ),
      24,
    ),
  );

  for (const g of a.groups) {
    const rows = g.items
      .map((i, idx) => {
        const amt = itemAmount(i, cur);
        const meta =
          i.status === "tomorrow"
            ? [`Vence amanhã, ${weekdayDate(i.date)}`, i.bill ? i.categoryName : i.categoryName].filter(Boolean).join(" · ")
            : i.direction === "in"
              ? `Ainda não entrou · era pra ${weekdayDate(i.date)}`
              : `Atrasada · venceu ${weekdayDate(i.date)}`;
        return itemRow({
          name: i.description,
          meta,
          metaColor: i.status === "overdue" ? C.warnStrong : undefined,
          amount: amt.amount,
          amountColor: amt.color,
          border: idx > 0 || true,
        });
      })
      .join("");
    let foot = "";
    if (g.afterCents !== null) {
      foot =
        g.afterCents >= 0
          ? `<tr><td colspan="2" bgcolor="${C.inSoft}" style="background:${C.inSoft};padding:11px 14px;border-radius:0 0 12px 12px;font-family:Inter,Arial,sans-serif;font-size:13px;color:${C.inText}">Dá pra pagar: sobra ${strong(money(g.afterCents, cur), C.inText)} na conta.</td></tr>`
          : `<tr><td colspan="2" bgcolor="${C.outSoft}" style="background:${C.outSoft};padding:11px 14px;border-radius:0 0 12px 12px;font-family:Inter,Arial,sans-serif;font-size:13px;color:${C.outText}">Não dá pra pagar tudo: faltam ${strong(money(-g.afterCents, cur), C.outText)} nessa conta.</td></tr>`;
    }
    const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:${C.text};padding:14px 0 6px">${esc(g.name)}</td>
${g.balanceCents !== null ? `<td align="right" style="font-family:Inter,Arial,sans-serif;font-size:13px;color:${C.soft};padding:14px 0 6px;white-space:nowrap">saldo hoje ${strong(balance(g.balanceCents, cur))}</td>` : ""}
</tr></table>`;
    body.push(
      block(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line2};border-radius:14px"><tr><td style="padding:0 16px">${header}${table(rows)}</td></tr>${foot ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${foot}</table></td></tr>` : ""}</table>`,
        14,
      ),
    );
  }

  body.push(
    block(
      button("Abrir A vencer", `${base.siteUrl}/a-pagar`) +
        paragraph("Já pagou ou já caiu? Marque no Velun e o aviso para.", { size: 13, color: C.soft, align: "center", top: 12 }),
      24,
    ),
  );

  const html = shell({
    title: subject,
    preheader: a.groups.map((g) => g.name).join(" · "),
    tag: longDate(today),
    body: body.join("\n"),
    footer: footer("alerts", base, false),
    siteUrl: base.siteUrl,
  });

  const text = [
    headline,
    "",
    ...a.groups.flatMap((g) => [
      `${g.name}${g.balanceCents !== null ? ` (saldo hoje ${balance(g.balanceCents, cur)})` : ""}:`,
      ...g.items.map(
        (i) =>
          `- ${i.description}: ${itemAmount(i, cur).amount} · ${i.status === "tomorrow" ? "vence amanhã" : i.direction === "in" ? `não entrou (era ${ddmm(i.date)})` : `atrasada desde ${ddmm(i.date)}`}`,
      ),
      g.afterCents !== null
        ? g.afterCents >= 0
          ? `  Dá pra pagar: sobra ${money(g.afterCents, cur)}.`
          : `  Faltam ${money(-g.afterCents, cur)} nessa conta.`
        : "",
      "",
    ]),
    `Abrir A vencer: ${base.siteUrl}/a-pagar`,
    textFooter("alerts", base),
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Fechamento do mês
// ---------------------------------------------------------------------------

function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

const CATEGORY_COLORS = ["#0C8599", "#3B5BDB", "#1C7ED6", "#E8590C", "#C2255C"];

export function renderMonthly(m: MonthSummary, base: RenderBase): BuiltEmail {
  const cur = base.currency;
  const name = monthName(m.month);
  const prevName = monthName(m.prevMonth);
  const Name = capitalize(name);
  const net = m.inCents - m.outCents;
  const we = base.shared ? "Vocês gastaram" : "Você gastou";

  const subject =
    net >= 0
      ? `${Name} fechou: sobrou ${money(net, cur)}`
      : `${Name} fechou: saiu ${money(-net, cur)} a mais do que entrou`;
  const headline =
    net >= 0
      ? `${Name} fechou no azul: sobrou ${money(net, cur)}.`
      : `${Name} fechou no vermelho: saiu ${money(-net, cur)} a mais do que entrou.`;

  // Frase de comparação com o mês anterior.
  let compare = "";
  const change = m.hasPrev ? pctChange(m.outCents, m.prevOutCents) : null;
  if (change !== null && change !== 0) {
    compare = `${we} ${Math.abs(change)}% ${change < 0 ? "menos" : "mais"} que em ${prevName}.`;
    const deltas = m.categories
      .filter((c) => c.prevCents !== null)
      .map((c) => ({ name: c.name, diff: c.cents - (c.prevCents ?? 0) }));
    const pick = change < 0 ? deltas.sort((a, b) => a.diff - b.diff)[0] : deltas.sort((a, b) => b.diff - a.diff)[0];
    if (pick && (change < 0 ? pick.diff < 0 : pick.diff > 0)) {
      compare += ` A maior ${change < 0 ? "queda" : "alta"} foi em ${pick.name}.`;
    }
  } else if (change === 0) {
    compare = `${we} o mesmo que em ${prevName}.`;
  }

  const body: string[] = [];
  body.push(block(heading(headline) + (compare ? paragraph(esc(compare)) : ""), 24));
  body.push(
    block(
      box(
        stats([
          {
            label: "Entrou",
            value: money(m.inCents, cur),
            color: C.in,
            bg: C.primarySoft,
            note: m.hasPrev ? `${prevName}: ${money(m.prevInCents, cur)}` : undefined,
          },
          {
            label: "Saiu",
            value: money(m.outCents, cur),
            color: C.out,
            bg: C.primarySoft,
            note: m.hasPrev ? `${prevName}: ${money(m.prevOutCents, cur)}` : undefined,
          },
          {
            label: net >= 0 ? "Sobrou" : "Faltou",
            value: signed(net, cur),
            color: C.text,
            bg: C.primarySoft,
            note: m.hasPrev ? `${prevName}: ${signed(m.prevInCents - m.prevOutCents, cur)}` : undefined,
          },
        ]),
        C.primarySoft,
        "6px 6px",
      ),
      20,
    ),
  );

  if (m.accounts.length > 0) {
    const lastDay = ddmm(`${m.month}-${String(new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`);
    const rows = m.accounts.map((a) => {
      const transfers = a.endCents - a.startCents - a.inCents + a.outCents;
      const notes = [`começou com ${balance(a.startCents, cur)}`];
      if (transfers !== 0) notes.push(`transferências ${signed(transfers, cur)}`);
      return {
        cells: [
          { html: esc(a.name) },
          { html: esc(a.inCents ? signed(a.inCents, cur) : "—"), color: a.inCents ? C.in : C.faint },
          { html: esc(a.outCents ? signed(-a.outCents, cur) : "—"), color: a.outCents ? C.out : C.faint },
          { html: esc(balance(a.endCents, cur)), color: a.endCents < 0 ? C.out : C.text, bold: true },
        ],
        note: notes.join(" · "),
      };
    });
    const negatives = m.accounts.filter((a) => a.negativeDays > 0);
    const endTotal = m.accounts.reduce((s, a) => s + a.endCents, 0);
    body.push(
      block(
        sectionTitle("Conta por conta") +
          grid({
            head: ["Conta", "Entrou", "Saiu", `Saldo ${lastDay}`],
            rows,
            total:
              m.accounts.length > 1
                ? [
                    { html: "Total" },
                    { html: esc(signed(m.inCents, cur)), color: C.in },
                    { html: esc(signed(-m.outCents, cur)), color: C.out },
                    { html: esc(balance(endTotal, cur)), color: endTotal < 0 ? C.out : C.text },
                  ]
                : undefined,
          }) +
          negatives
            .map(
              (a) =>
                `<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>${box(
                  `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.5;color:${C.warn}">${strong(a.name, C.warn)} ficou negativa ${esc(plural(a.negativeDays, "dia", "dias"))} no mês. Vale conferir se o banco cobrou taxa.</div>`,
                  C.warnSoft,
                  "11px 14px",
                )}`,
            )
            .join("") +
          paragraph("Transferência entre as contas da casa não conta como entrada nem saída.", {
            size: 12,
            color: C.faint,
            top: 8,
          }),
        26,
      ),
    );
  }

  if (m.categories.length > 0) {
    const max = m.categories[0].cents || 1;
    const rows = m.categories
      .map((c, i) => {
        let delta = "";
        let deltaColor: string = C.soft;
        if (c.prevCents !== null) {
          const diff = c.cents - c.prevCents;
          if (Math.abs(diff) < 100) delta = "igual";
          else {
            delta = `${diff > 0 ? "+" : "−"}${moneyShort(Math.round(Math.abs(diff) / 100) * 100, cur)}`;
            deltaColor = diff > 0 ? C.out : C.in;
          }
        }
        return `<tr><td style="border-top:1px solid ${C.line};padding:10px 0 4px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;color:${C.text}">${esc(c.name)}</td>
<td align="right" style="border-top:1px solid ${C.line};padding:10px 0 4px;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:700;color:${C.text};white-space:nowrap">${esc(money(c.cents, cur))}</td>
<td align="right" width="80" style="border-top:1px solid ${C.line};padding:10px 0 4px;font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;color:${deltaColor};white-space:nowrap">${esc(delta)}</td></tr>
<tr><td colspan="3" style="padding:0 0 10px">${bar(c.cents / max, c.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length])}</td></tr>`;
      })
      .join("");
    body.push(
      block(
        sectionTitle("Onde foi o dinheiro", m.hasPrev ? `vs. ${prevName}` : undefined) +
          table(rows) +
          (m.otherCategories.count > 0
            ? paragraph(
                esc(`E mais ${plural(m.otherCategories.count, "categoria", "categorias")} somando ${money(m.otherCategories.cents, cur)}.`),
                { size: 12, color: C.faint, top: 4 },
              )
            : ""),
        26,
      ),
    );
  }

  if (m.goals.length > 0) {
    const cards = m.goals
      .map((g) => {
        let right = "";
        let note = "";
        let color: string = C.primary;
        let noteColor: string = C.in;
        if (g.kind === "save") {
          right = g.targetCents ? `${moneyShort(g.currentCents, cur)} de ${moneyShort(g.targetCents, cur)}` : moneyShort(g.currentCents, cur);
          note = g.monthCents > 0 ? `+${moneyShort(g.monthCents, cur)} em ${name}` : g.progress >= 1 ? "Chegou lá!" : "";
        } else if (g.kind === "limit") {
          right = `${moneyShort(g.currentCents, cur)} de ${moneyShort(g.targetCents ?? 0, cur)}`;
          if (g.over) {
            color = "#F04438";
            noteColor = C.out;
            note = `Passou ${moneyShort(g.currentCents - (g.targetCents ?? 0), cur)} do limite`;
          } else {
            note = `Sobraram ${moneyShort((g.targetCents ?? 0) - g.currentCents, cur)} do limite`;
          }
        } else {
          right = `faltam ${moneyShort(g.currentCents, cur)}`;
          note = g.progress > 0 ? `${Math.round(g.progress * 100)}% pago` : "";
          noteColor = C.soft;
        }
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${g.over ? "#FEE4E2" : C.line2};border-radius:14px;margin-top:10px"><tr><td style="padding:13px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;color:${C.text}">${esc(g.name)}</td>
<td align="right" style="font-family:Inter,Arial,sans-serif;font-size:13px;font-weight:700;color:${g.over ? C.out : C.text};white-space:nowrap">${esc(right)}</td>
</tr></table>
<div style="height:9px;line-height:9px;font-size:0">&nbsp;</div>${bar(Math.min(1, g.progress), color)}
${note ? `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:600;color:${noteColor};margin-top:8px">${esc(note)}</div>` : ""}
</td></tr></table>`;
      })
      .join("");
    body.push(block(sectionTitle("Metas") + cards, 26));
  }

  if (m.next.count > 0) {
    const nextName = monthName(addDaysISO(`${m.month}-28`, 7));
    body.push(
      block(
        box(
          sectionTitle(`Em ${nextName}, já previsto`) +
            paragraph(
              `${strong(money(m.next.outCents, cur))} a pagar e ${strong(money(m.next.inCents, cur))} a receber, em ${esc(plural(m.next.count, "lançamento", "lançamentos"))}.`,
              { size: 14, top: 0 },
            ),
          "#F9FAFB",
          "16px 18px",
        ),
        26,
      ),
    );
  }

  const [y, mm] = m.month.split("-");
  body.push(
    block(
      button(`Ver o relatório de ${name}`, `${base.siteUrl}/relatorios?month=${y}-${mm}`) +
        paragraph("No relatório dá pra baixar o PDF completo, com todos os lançamentos.", {
          size: 12,
          color: C.faint,
          align: "center",
          top: 12,
        }),
      24,
    ),
  );

  const html = shell({
    title: subject,
    preheader: `Entrou ${money(m.inCents, cur)}, saiu ${money(m.outCents, cur)}`,
    tag: `Fechamento de ${name}`,
    body: body.join("\n"),
    footer: footer("monthly", base, true),
    siteUrl: base.siteUrl,
  });

  const text = [
    headline,
    compare,
    "",
    `Entrou: ${money(m.inCents, cur)}`,
    `Saiu: ${money(m.outCents, cur)}`,
    "",
    ...(m.accounts.length
      ? [
          "Conta por conta:",
          ...m.accounts.map(
            (a) =>
              `- ${a.name}: entrou ${money(a.inCents, cur)}, saiu ${money(a.outCents, cur)}, terminou com ${balance(a.endCents, cur)}`,
          ),
          "",
        ]
      : []),
    ...(m.categories.length ? ["Onde foi o dinheiro:", ...m.categories.map((c) => `- ${c.name}: ${money(c.cents, cur)}`), ""] : []),
    `Relatório: ${base.siteUrl}/relatorios?month=${y}-${mm}`,
    textFooter("monthly", base),
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Convite
// ---------------------------------------------------------------------------

export function renderInvite(opts: {
  inviterName: string;
  householdName: string;
  link: string;
  email: string;
  expiresOn: string;
  siteUrl: string;
}): BuiltEmail {
  const subject = `${opts.inviterName} te chamou pra dividir as finanças da casa no Velun`;
  const benefit = (bg: string, fg: string, path: string, text: string) =>
    `<tr><td width="46" valign="middle" style="padding:6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" align="center" valign="middle" bgcolor="${bg}" style="background:${bg};border-radius:10px;color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:700">${path}</td></tr></table></td>
<td valign="middle" style="padding:6px 0;font-family:Inter,Arial,sans-serif;font-size:14px;color:${C.muted}">${esc(text)}</td></tr>`;
  const body = [
    block(
      heading(`${opts.inviterName} te chamou pra casa ${opts.householdName} no Velun.`) +
        paragraph(
          "No Velun vocês veem juntos o saldo, o que vence e pra onde vai o dinheiro. E cada um escolhe o que mostra das próprias contas.",
        ),
      26,
    ),
    block(
      table(
        benefit("#E9FBF2", "#19B86A", "$", "Saldo e gastos da casa num lugar só") +
          benefit("#F0EDFF", "#7056EB", "&#9673;", "Suas contas pessoais: você escolhe o que o outro vê") +
          benefit("#FFF0F3", "#F04469", "&#10003;", "Decisões em conjunto, com os mesmos números"),
      ),
      16,
    ),
    block(
      button("Aceitar o convite", opts.link) +
        paragraph(
          `O convite vale até ${esc(weekdayDate(opts.expiresOn))} e só funciona com este e-mail (${esc(opts.email)}).<br>Não esperava por isto? É só ignorar.`,
          { size: 12, color: C.faint, align: "center", top: 12 },
        ),
      24,
    ),
  ].join("\n");
  const html = shell({
    title: subject,
    preheader: "Aceite o convite pra ver as finanças da casa juntos.",
    body,
    siteUrl: opts.siteUrl,
  });
  const text = [
    `${opts.inviterName} te chamou pra casa ${opts.householdName} no Velun.`,
    "",
    "No Velun vocês veem juntos o saldo, o que vence e pra onde vai o dinheiro. E cada um escolhe o que mostra das próprias contas.",
    "",
    `Aceitar o convite: ${opts.link}`,
    "",
    `O convite vale até ${weekdayDate(opts.expiresOn)} e só funciona com este e-mail (${opts.email}). Não esperava por isto? É só ignorar.`,
  ].join("\n");
  return { subject, html, text };
}
