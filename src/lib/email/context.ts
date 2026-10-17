import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/lib/money";

/**
 * Pra quem e de qual casa é o e-mail.
 *
 * `supabase` pode ser o cliente da própria pessoa (botão "Mandar um de
 * teste": o RLS vale) ou o da rotina agendada (service role, sem RLS).
 * Por isso TODA consulta dos e-mails filtra por `household_id` e pelas
 * contas que `accountScope` libera pra `memberId` — a privacidade não pode
 * depender do RLS aqui.
 */
export type EmailContext = {
  supabase: SupabaseClient;
  householdId: string;
  householdName: string;
  memberId: string;
  /** Primeiro nome, pro "Bom dia, Levi". */
  firstName: string;
  /** Casa com mais de uma pessoa: o texto fala "vocês". */
  shared: boolean;
  currency: CurrencyCode;
  timezone: string;
  /** Hoje no fuso da casa (AAAA-MM-DD). */
  today: string;
  /** https://velunapp.com, sem barra no fim. */
  siteUrl: string;
  /** Link "parar de receber" deste tipo de e-mail (null no teste sem token). */
  unsubscribeUrl: (kind: EmailKind) => string | null;
};

export type EmailKind = "weekly" | "monthly" | "alerts";

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  weekly: "o resumo da semana",
  monthly: "o fechamento do mês",
  alerts: "os avisos de vencimento",
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "https://velunapp.com";
  return raw.replace(/\/+$/, "");
}

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}
