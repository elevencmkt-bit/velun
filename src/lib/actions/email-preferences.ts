"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import type { EmailKind } from "@/lib/email/context";
import { emailConfigured } from "@/lib/email/send";
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
