"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Quem está aceitando o convite ainda não é membro de household
// nenhum, então current_household_id() não enxerga nada pra ele — a
// validação do convite e a criação da linha em `members` têm que
// rodar pela service role (bypass de RLS), igual o upload de avatar.
export async function acceptInvite(token: string, formData: FormData) {
  const admin = createAdminClient();

  function fail(message: string): never {
    redirect(`/convite/${token}?error=${encodeURIComponent(message)}`);
  }

  const { data: invite, error: inviteError } = await admin
    .from("household_invites")
    .select("id, household_id, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite) fail("Convite inválido.");
  if (invite.accepted_at) fail("Esse convite já foi usado.");
  if (new Date(invite.expires_at) < new Date()) fail("Esse convite expirou.");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) fail("Nome é obrigatório.");
  if (!email) fail("Email é obrigatório.");
  if (password.length < 6) fail("Senha precisa ter pelo menos 6 caracteres.");

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) fail(signUpError.message);

  const userId = signUpData.user?.id;
  if (!userId) fail("Não foi possível criar a conta.");

  const { error: memberError } = await admin.from("members").insert({
    id: userId,
    household_id: invite.household_id,
    display_name: name,
    color: "",
  });
  if (memberError) fail(memberError.message);

  await admin
    .from("household_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invite.id);

  // Se o projeto exigir confirmação de email, signUp não devolve
  // sessão ativa — manda pro login com um aviso em vez de tentar usar
  // uma sessão que não existe.
  if (signUpData.session) {
    redirect("/mes");
  }
  redirect("/login?confirm=1");
}
