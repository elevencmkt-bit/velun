import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailKind } from "./context";

const KINDS: EmailKind[] = ["weekly", "monthly", "alerts"];

export function isEmailKind(k: string): k is EmailKind {
  return (KINDS as string[]).includes(k);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quem é o dono do token e se o tipo ainda está ligado (null: link inválido). */
export async function lookupToken(token: string, kind: string) {
  if (!UUID.test(token) || !isEmailKind(kind)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_preferences")
    .select("member_id, weekly, monthly, alerts")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!data) return null;
  return { kind, on: Boolean((data as Record<string, unknown>)[kind]) };
}

/** Desliga um tipo de e-mail pelo token do rodapé. */
export async function unsubscribeByToken(token: string, kind: string): Promise<boolean> {
  if (!UUID.test(token) || !isEmailKind(kind)) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_preferences")
    .update({ [kind]: false, updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("member_id");
  return !error && (data?.length ?? 0) > 0;
}
