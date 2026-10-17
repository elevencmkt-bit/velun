import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/lib/money";
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

/** Data local (AAAA-MM-DD) num fuso, num instante dado. */
function localDate(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Reserva que ficou "enviando" por mais que isso (rodada morreu no meio): tenta de novo. */
const STALE_CLAIM_MS = 30 * 60 * 1000;

/**
 * Reserva o envio (pessoa, tipo, período). Devolve false se outra rodada
 * já mandou, pulou ou está mandando agora.
 */
async function claim(admin: SupabaseClient, memberId: string, kind: EmailKind, period: string): Promise<boolean | string> {
  const { error } = await admin.from("email_log").insert({ member_id: memberId, kind, period, status: "pending" });
  if (!error) return true;
  if (error.code !== "23505") return error.message;
  // Já existe: só retoma se for uma reserva velha que nunca terminou.
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data } = await admin
    .from("email_log")
    .update({ created_at: new Date().toISOString() })
    .match({ member_id: memberId, kind, period, status: "pending" })
    .lt("created_at", cutoff)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function runScheduledEmails(
  admin: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const report: RunReport = { households: 0, sent: [], skipped: [], errors: [] };

  const { data: households, error } = await admin.from("households").select("id, name, currency, timezone");
  if (error) throw new Error(error.message);

  for (const h of households ?? []) {
    const timezone = (h.timezone as string | null) ?? "America/New_York";
    if (localHour(timezone, now) < SEND_HOUR) continue;
    const today = localDate(timezone, now);
    report.households += 1;

    const { data: members } = await admin
      .from("members")
      .select("id, display_name")
      .eq("household_id", h.id);
    const people = members ?? [];
    if (people.length === 0) continue;

    // O que já foi resolvido hoje (mandado, pulado ou mandando): sem isso,
    // cada rodada depois das 8h refaria as consultas de todo mundo.
    const ids = people.map((m) => m.id as string);
    const [{ data: prefRows }, { data: logRows }] = await Promise.all([
      admin.from("email_preferences").select("member_id, weekly, monthly, alerts, unsubscribe_token").in("member_id", ids),
      admin
        .from("email_log")
        .select("member_id, kind, period, status, created_at")
        .in("member_id", ids)
        .in("period", [today, closingMonth(today)]),
    ]);
    const prefsBy = new Map((prefRows ?? []).map((p) => [p.member_id as string, p as Preferences]));
    const staleBefore = now.getTime() - STALE_CLAIM_MS;
    const done = new Set(
      (logRows ?? [])
        .filter((l) => l.status !== "pending" || new Date(l.created_at as string).getTime() > staleBefore)
        .map((l) => `${l.member_id}:${l.kind}:${l.period}`),
    );

    for (const m of people) {
      const memberId = m.id as string;
      const label = (m.display_name as string) ?? memberId;
      try {
        const known = prefsBy.get(memberId);
        const flags = known ?? { weekly: true, monthly: true, alerts: true };
        const kinds = dueKinds(today, flags).filter((k) => !done.has(`${memberId}:${k.kind}:${k.period}`));
        if (kinds.length === 0) continue;

        // Simulação não grava nada (nem a linha de preferências).
        const prefs = known ?? (opts.dryRun ? null : await ensurePreferences(admin, memberId));
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
          shared: people.length > 1,
          currency: ((h.currency as CurrencyCode | null) ?? "USD") as CurrencyCode,
          timezone,
          today,
          siteUrl: siteUrl(),
          unsubscribeUrl: (kind) => (prefs ? unsubscribeLink(prefs.unsubscribe_token, kind) : null),
        };

        for (const { kind, period } of kinds) {
          const key = { member_id: memberId, kind, period };
          if (!opts.dryRun) {
            const claimed = await claim(admin, memberId, kind, period);
            if (claimed !== true) {
              if (typeof claimed === "string") report.errors.push({ member: label, kind, error: claimed });
              continue;
            }
          }

          let email;
          try {
            email = await buildEmail(kind, ctx);
          } catch (e) {
            if (!opts.dryRun) await admin.from("email_log").delete().match(key);
            report.errors.push({ member: label, kind, error: e instanceof Error ? e.message : String(e) });
            continue;
          }

          if (!email) {
            if (!opts.dryRun) await admin.from("email_log").update({ status: "skipped" }).match(key);
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
            // Se a resposta do Resend se perder e a rodada tentar de novo, o
            // Resend reconhece e não manda duas vezes.
            idempotencyKey: `${memberId}:${kind}:${period}`,
          });
          if (result.ok) {
            await admin.from("email_log").update({ status: "sent", provider_id: result.id }).match(key);
            report.sent.push({ member: label, kind, subject: email.subject });
          } else {
            // Libera a reserva: a próxima rodada tenta de novo.
            await admin.from("email_log").delete().match(key);
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
