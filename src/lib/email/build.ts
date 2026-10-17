import { addDaysISO } from "@/lib/today";
import type { BuiltEmail, EmailContext, EmailKind } from "./context";
import { loadUpcoming } from "./upcoming";
import { buildWeek, OVERDUE_WINDOW_DAYS } from "./week";
import { buildAlerts } from "./alerts";
import { loadMonth } from "./month";
import { renderAlerts, renderMonthly, renderWeekly, type RenderBase } from "./render";
import { monthOf, previousMonth } from "./format";

/** O mês que o fechamento resume, visto de `today` (o mês anterior). */
export function closingMonth(today: string): string {
  return previousMonth(monthOf(today));
}

/**
 * Monta um e-mail pra uma pessoa. Devolve null quando não há o que dizer
 * (aviso num dia sem nada vencendo; mês sem nenhum lançamento).
 */
export async function buildEmail(kind: EmailKind, ctx: EmailContext, opts: { force?: boolean } = {}): Promise<BuiltEmail | null> {
  const base: RenderBase = {
    firstName: ctx.firstName,
    householdName: ctx.householdName,
    shared: ctx.shared,
    currency: ctx.currency,
    siteUrl: ctx.siteUrl,
    unsubscribeUrl: ctx.unsubscribeUrl(kind),
  };

  if (kind === "weekly") {
    const { accounts, items, excludedCount } = await loadUpcoming(ctx, addDaysISO(ctx.today, -OVERDUE_WINDOW_DAYS), addDaysISO(ctx.today, 6));
    return renderWeekly(buildWeek({ today: ctx.today, accounts, items, excludedCount }), base);
  }

  if (kind === "alerts") {
    const { accounts, items } = await loadUpcoming(ctx, addDaysISO(ctx.today, -OVERDUE_WINDOW_DAYS), addDaysISO(ctx.today, 1));
    let summary = buildAlerts({ today: ctx.today, accounts, items });
    // Teste num dia sem nada novo: mostra as atrasadas e o que vence nos
    // próximos dias, pra dar pra ver como fica.
    if (!summary && opts.force) {
      const later = await loadUpcoming(ctx, addDaysISO(ctx.today, -OVERDUE_WINDOW_DAYS), addDaysISO(ctx.today, 14));
      const firstOut = later.items.find((i) => i.date > ctx.today && i.direction === "out" && !i.silent);
      if (firstOut) {
        const fakeToday = addDaysISO(firstOut.date, -1);
        summary = buildAlerts({ today: fakeToday, accounts: later.accounts, items: later.items });
        if (summary) return renderAlerts(summary, base, fakeToday);
      }
      return null;
    }
    return summary ? renderAlerts(summary, base, ctx.today) : null;
  }

  const month = closingMonth(ctx.today);
  const summary = await loadMonth(ctx, month);
  if (summary.count === 0 && !opts.force) return null;
  return renderMonthly(summary, base);
}
