"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";

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
