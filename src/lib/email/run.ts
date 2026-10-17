import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/lib/money";
import { todayIn } from "@/lib/today";
import { buildEmail, closingMonth } from "./build";
import { firstNameOf, siteUrl, type EmailContext, type EmailKind } from "./context";
import { sendEmail } from "./send";
import { weekdayOf } from "./format";

// A rotina de hora em hora. Pra cada casa, olha a hora local:
// a partir das 8h, manda o que ainda não foi mandado hoje.
// - segunda: resumo da semana (e aí o aviso do dia fica de fora: o resumo
//   já mostra o que vence e o que está atrasado);
// - dia 1: fechamento do mês anterior;
// - todo dia: aviso de vencimento, se houver o que avisar.
// Rodar de novo na mesma hora (ou a cada hora) não repete nada: cada envio
// "reserva" sua linha em email_log antes de mandar.

export const SEND_HOUR = 8;

export type Preferences = {
  member_id: string;
  weekly: boolean;
  monthly: boolean;
  alerts: boolean;
  unsubscribe_token: string;
};

export function unsubscribeLink(token: string, kind: EmailKind): string {
  return `${siteUrl()}/api/emails/sair?t=${encodeURIComponent(token)}&k=${kind}`;
}

function localHour(timeZone: string, now: Date): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now);
    return Number(h);
  } catch {
    return now.getUTCHours();
  }
}

/** Quais e-mails vencem hoje pra essa pessoa (antes de olhar o registro). */
export function dueKinds(today: string, prefs: Pick<Preferences, "weekly" | "monthly" | "alerts">): { kind: EmailKind; period: string }[] {
  const out: { kind: EmailKind; period: string }[] = [];
  const monday = weekdayOf(today) === 1;
  if (monday && prefs.weekly) out.push({ kind: "weekly", period: today });
  if (today.endsWith("-01") && prefs.monthly) out.push({ kind: "monthly", period: closingMonth(today) });
  // Na segunda, quem recebe o resumo não recebe o aviso.
  if (prefs.alerts && !(monday && prefs.weekly)) out.push({ kind: "alerts", period: today });
  return out;
}

/** Garante a linha de preferências (com o token) e devolve. */
export async function ensurePreferences(admin: SupabaseClient, memberId: string): Promise<Preferences> {
  const { data } = await admin
    .from("email_preferences")
    .select("member_id, weekly, monthly, alerts, unsubscribe_token")
    .eq("member_id", memberId)
    .maybeSingle();
  if (data) return data as Preferences;
  await admin.from("email_preferences").upsert({ member_id: memberId }, { onConflict: "member_id", ignoreDuplicates: true });
  const { data: created, error } = await admin
    .from("email_preferences")
    .select("member_id, weekly, monthly, alerts, unsubscribe_token")
    .eq("member_id", memberId)
    .single();
  if (error) throw new Error(error.message);
  return created as Preferences;
}

export type RunReport = {
  households: number;
  sent: { member: string; kind: EmailKind; subject: string }[];
  skipped: { member: string; kind: EmailKind; reason: string }[];
  errors: { member: string; kind?: EmailKind; error: string }[];
};

export async function runScheduledEmails(
  admin: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean; onlyMember?: string } = {},
): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const report: RunReport = { households: 0, sent: [], skipped: [], errors: [] };

  const { data: households, error } = await admin.from("households").select("id, name, currency, timezone");
  if (error) throw new Error(error.message);

  for (const h of households ?? []) {
    const timezone = (h.timezone as string | null) ?? "America/New_York";
    if (localHour(timezone, now) < SEND_HOUR && !opts.onlyMember) continue;
    const today = todayIn(timezone);
    report.households += 1;

    const { data: members } = await admin
      .from("members")
      .select("id, display_name")
      .eq("household_id", h.id);
    const people = (members ?? []).filter((m) => !opts.onlyMember || m.id === opts.onlyMember);

    for (const m of people) {
      const memberId = m.id as string;
      const label = (m.display_name as string) ?? memberId;
      try {
        const prefs = await ensurePreferences(admin, memberId);
        const kinds = dueKinds(today, prefs);
        if (kinds.length === 0) continue;

        const { data: userData } = await admin.auth.admin.getUserById(memberId);
        const to = userData?.user?.email;
        if (!to) {
          report.skipped.push({ member: label, kind: kinds[0].kind, reason: "sem e-mail" });
          continue;
        }

        const ctx: EmailContext = {
          supabase: admin,
          householdId: h.id as string,
          householdName: h.name as string,
          memberId,
          firstName: firstNameOf(label),
          shared: (members ?? []).length > 1,
          currency: ((h.currency as CurrencyCode | null) ?? "USD") as CurrencyCode,
          timezone,
          today,
          siteUrl: siteUrl(),
          unsubscribeUrl: (kind) => unsubscribeLink(prefs.unsubscribe_token, kind),
        };

        for (const { kind, period } of kinds) {
          if (!opts.dryRun) {
            // Reserva: se a linha já existe, outra rodada já cuidou disso.
            const { error: claimError } = await admin
              .from("email_log")
              .insert({ member_id: memberId, kind, period, status: "sent" });
            if (claimError) {
              if (claimError.code !== "23505") report.errors.push({ member: label, kind, error: claimError.message });
              continue;
            }
          }

          let email;
          try {
            email = await buildEmail(kind, ctx);
          } catch (e) {
            if (!opts.dryRun) await admin.from("email_log").delete().match({ member_id: memberId, kind, period });
            report.errors.push({ member: label, kind, error: e instanceof Error ? e.message : String(e) });
            continue;
          }

          if (!email) {
            if (!opts.dryRun) {
              await admin.from("email_log").update({ status: "skipped" }).match({ member_id: memberId, kind, period });
            }
            report.skipped.push({ member: label, kind, reason: "nada a dizer" });
            continue;
          }

          if (opts.dryRun) {
            report.sent.push({ member: label, kind, subject: email.subject });
            continue;
          }

          const result = await sendEmail({
            to,
            subject: email.subject,
            html: email.html,
            text: email.text,
            unsubscribeUrl: ctx.unsubscribeUrl(kind),
            tag: kind,
          });
          if (result.ok) {
            await admin.from("email_log").update({ provider_id: result.id }).match({ member_id: memberId, kind, period });
            report.sent.push({ member: label, kind, subject: email.subject });
          } else {
            // Libera a reserva: a próxima rodada tenta de novo.
            await admin.from("email_log").delete().match({ member_id: memberId, kind, period });
            report.errors.push({ member: label, kind, error: result.error });
          }
        }
      } catch (e) {
        report.errors.push({ member: label, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return report;
}
