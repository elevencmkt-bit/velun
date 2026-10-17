"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/current-member";
import { renderInvite } from "@/lib/email/render";
import { siteUrl } from "@/lib/email/context";
import { emailConfigured, sendEmail } from "@/lib/email/send";

const INVITE_TTL_DAYS = 7;

// O link de convite é uma alternativa sempre disponível (não só depois
// de convidar por email) — então tanto "Copiar link" quanto "Convidar
// pessoa" passam por aqui: reaproveita o convite pendente se já existir
// (só atualiza o email, se um novo foi informado) ou cria um novo.
export async function ensureInvite(email?: string): Promise<string> {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();
  const trimmedEmail = email?.trim() || null;

  const { data: existing, error: existingError } = await supabase
    .from("household_invites")
    .select("id, token")
    .eq("household_id", householdId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    if (trimmedEmail) {
      const { data, error } = await supabase
        .from("household_invites")
        .update({ email: trimmedEmail })
        .eq("id", existing.id)
        .select("id");
      if (error) throw new Error(error.message);
      // RLS bloqueando o update não gera erro, só devolve 0 linhas —
      // sem essa checagem a escrita falha em silêncio.
      if (!data || data.length === 0) {
        throw new Error("Não foi possível salvar o email do convite (permissão negada).");
      }
    }
    revalidatePath("/configuracoes");
    return existing.token;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("household_invites").insert({
    household_id: householdId,
    token,
    created_by: memberId,
    expires_at: expiresAt,
    email: trimmedEmail,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
  return token;
}

/**
 * Convite com e-mail: gera (ou reaproveita) o convite e manda o e-mail
 * pela pessoa. Sem o envio ligado no servidor, devolve só o link pra
 * copiar, como antes.
 */
export async function inviteByEmail(email: string): Promise<{ token: string; emailed: boolean; note?: string }> {
  const trimmed = email.trim().toLowerCase();
  // Um endereço só, sem espaço nem vírgula.
  if (trimmed && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(trimmed)) {
    throw new Error("Esse e-mail não parece certo. Confira e tente de novo.");
  }
  const token = await ensureInvite(trimmed);
  if (!trimmed || !emailConfigured()) return { token, emailed: false };

  const { householdId, displayName } = await getCurrentMember();
  const supabase = await createClient();
  const [{ data: household }, { data: invite }] = await Promise.all([
    supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
    supabase
      .from("household_invites")
      .select("id, expires_at, emailed_at")
      .eq("token", token)
      .eq("household_id", householdId)
      .maybeSingle(),
  ]);
  // No máximo um e-mail de convite a cada 2 minutos por casa.
  const last = invite?.emailed_at ? new Date(invite.emailed_at as string).getTime() : 0;
  if (Date.now() - last < 2 * 60 * 1000) {
    return { token, emailed: false, note: "O convite acabou de ser mandado. Espere uns minutos pra mandar de novo." };
  }
  const site = siteUrl();
  const oneLine = (t: string) => t.replace(/[\r\n]+/g, " ").trim();
  const built = renderInvite({
    inviterName: oneLine(displayName),
    householdName: oneLine((household?.name as string | undefined) ?? "sua casa"),
    link: `${site}/convite/${token}`,
    email: trimmed,
    expiresOn: String(invite?.expires_at ?? new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString()).slice(0, 10),
    siteUrl: site,
  });
  const result = await sendEmail({ to: trimmed, subject: built.subject, html: built.html, text: built.text, tag: "convite" });
  if (!result.ok) {
    console.error("[convite] e-mail não saiu:", result.error);
    return { token, emailed: false };
  }
  if (invite?.id) {
    // Pela service role: a coluna é só desta rotina, o app não escreve nela.
    await createAdminClient()
      .from("household_invites")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("household_id", householdId);
  }
  return { token, emailed: true };
}

export async function revokeInvite(inviteId: string) {
  const { householdId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("household_invites")
    .delete()
    .eq("id", inviteId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
}
