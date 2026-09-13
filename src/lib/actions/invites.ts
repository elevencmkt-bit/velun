"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";

const INVITE_TTL_DAYS = 7;

export async function createInvite(email?: string) {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trimmedEmail = email?.trim() || null;

  const { error } = await supabase.from("household_invites").insert({
    household_id: householdId,
    token,
    created_by: memberId,
    expires_at: expiresAt,
    email: trimmedEmail,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes");
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
