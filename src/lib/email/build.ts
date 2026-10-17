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
export async function buildEmail(kind: EmailKind, ctx: EmailContext): Promise<BuiltEmail | null> {
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
    const summary = buildAlerts({ today: ctx.today, accounts, items });
    return summary ? renderAlerts(summary, base, ctx.today) : null;
  }

  const month = closingMonth(ctx.today);
  const summary = await loadMonth(ctx, month);
  if (summary.count === 0) return null;
  return renderMonthly(summary, base);
}
