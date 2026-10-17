"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { buildEmail } from "@/lib/email/build";
import { firstNameOf, siteUrl, type EmailContext, type EmailKind } from "@/lib/email/context";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { unsubscribeLink } from "@/lib/email/run";
import { isEmailKind } from "@/lib/email/unsubscribe";

export type EmailSettings = {
  email: string | null;
  weekly: boolean;
  monthly: boolean;
  alerts: boolean;
  /** Resend configurado no servidor (sem isso nada sai). */
  ready: boolean;
};

async function ownPreferences(supabase: Awaited<ReturnType<typeof createClient>>, memberId: string) {
  const { data } = await supabase
    .from("email_preferences")
    .select("weekly, monthly, alerts, unsubscribe_token")
    .eq("member_id", memberId)
    .maybeSingle();
  return data as { weekly: boolean; monthly: boolean; alerts: boolean; unsubscribe_token: string } | null;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const { memberId } = await getCurrentMember();
  const supabase = await createClient();
  const [prefs, { data: claims }] = await Promise.all([ownPreferences(supabase, memberId), supabase.auth.getClaims()]);
  return {
    email: (claims?.claims?.email as string | undefined) ?? null,
    weekly: prefs?.weekly ?? true,
    monthly: prefs?.monthly ?? true,
    alerts: prefs?.alerts ?? true,
    ready: emailConfigured(),
  };
}

export async function setEmailPreference(kind: EmailKind, on: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailKind(kind)) return { ok: false, error: "Tipo de e-mail inválido." };
  const { memberId } = await getCurrentMember();
  const supabase = await createClient();
  const existing = await ownPreferences(supabase, memberId);
  const { error } = existing
    ? await supabase
        .from("email_preferences")
        .update({ [kind]: on, updated_at: new Date().toISOString() })
        .eq("member_id", memberId)
    : await supabase.from("email_preferences").insert({ member_id: memberId, [kind]: on });
  if (error) return { ok: false, error: "Não deu pra salvar agora. Tente de novo." };
  revalidatePath("/configuracoes");
  return { ok: true };
}

/** Manda um exemplo do e-mail agora, pra própria pessoa, com os dados de hoje. */
export async function sendTestEmail(kind: EmailKind): Promise<{ ok: boolean; message: string }> {
  if (!isEmailKind(kind)) return { ok: false, message: "Tipo de e-mail inválido." };
  if (!emailConfigured()) {
    return { ok: false, message: "O envio de e-mails ainda não foi ligado no servidor." };
  }
  const member = await getCurrentMember();
  const supabase = await createClient();

  const [{ data: claims }, { data: household }, { count }, existing] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("households").select("name").eq("id", member.householdId).maybeSingle(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("household_id", member.householdId),
    ownPreferences(supabase, member.memberId),
  ]);
  const to = claims?.claims?.email as string | undefined;
  if (!to) return { ok: false, message: "Sua conta está sem e-mail." };

  let prefs = existing;
  if (!prefs) {
    await supabase.from("email_preferences").insert({ member_id: member.memberId });
    prefs = await ownPreferences(supabase, member.memberId);
  }

  // O cliente é o da própria pessoa: o RLS vale, além do escopo de contas.
  const ctx: EmailContext = {
    supabase,
    householdId: member.householdId,
    householdName: (household?.name as string | undefined) ?? "sua casa",
    memberId: member.memberId,
    firstName: firstNameOf(member.displayName),
    shared: (count ?? 1) > 1,
    currency: member.currency,
    timezone: member.timezone,
    today: member.today,
    siteUrl: siteUrl(),
    unsubscribeUrl: (k) => (prefs ? unsubscribeLink(prefs.unsubscribe_token, k) : null),
  };

  let email;
  try {
    email = await buildEmail(kind, ctx, { force: true });
  } catch (e) {
    console.error("[email teste]", e);
    return { ok: false, message: "Não deu pra montar o e-mail agora. Tente de novo." };
  }
  if (!email) {
    return {
      ok: false,
      message:
        kind === "alerts"
          ? "Nada vence nas próximas duas semanas e nada está atrasado: hoje não teria aviso."
          : "Não tem lançamento no mês passado pra resumir.",
    };
  }

  const result = await sendEmail({
    to,
    subject: `[Teste] ${email.subject}`,
    html: email.html,
    text: email.text,
    unsubscribeUrl: ctx.unsubscribeUrl(kind),
    tag: "teste",
  });
  if (!result.ok) {
    console.error("[email teste]", result.error);
    return { ok: false, message: "O e-mail não saiu. Tente de novo em alguns minutos." };
  }
  return { ok: true, message: `Mandei pra ${to}. Pode levar um minutinho.` };
}
