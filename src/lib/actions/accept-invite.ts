"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Quem está aceitando o convite ainda não é membro de household
// nenhum, então current_household_id() não enxerga nada pra ele — a
// validação do convite e a criação da conta e da linha em `members`
// rodam pela service role (bypass de RLS), igual o upload de avatar.
//
// A conta é criada JÁ CONFIRMADA, sem email de confirmação. Motivo, na
// ordem em que importa:
//
// 1. O email não chegaria. Sem servidor de email próprio configurado, o
//    Supabase só entrega pra endereços da equipe do projeto e recusa o
//    resto ("Email address not authorized"); com a confirmação ligada,
//    quem vem por convite ficava travado pra sempre na tela de "confirme
//    seu email".
// 2. O convite já é a prova. O link é secreto, foi entregue pessoalmente
//    por quem convidou, só vale uma vez e expira em 7 dias — e, quando o
//    convite tem email, só esse email consegue usá-lo.
//
// A confirmação de email continua ligada no projeto pra qualquer outro
// caminho de criação de conta.
export async function acceptInvite(token: string, formData: FormData) {
  const admin = createAdminClient();

  function fail(message: string): never {
    redirect(`/convite/${token}?error=${encodeURIComponent(message)}`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) fail("Nome é obrigatório.");
  if (!email) fail("Email é obrigatório.");
  if (password.length < 6) fail("Senha precisa ter pelo menos 6 caracteres.");

  const { data: invite, error: inviteError } = await admin
    .from("household_invites")
    .select("id, household_id, expires_at, accepted_at, email")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite) fail("Convite inválido.");
  if (invite.accepted_at) fail("Esse convite já foi usado.");
  if (new Date(invite.expires_at) < new Date()) fail("Esse convite expirou.");

  // Convite feito pra um email: só esse email entra. Um link vazado não
  // serve pra mais ninguém.
  const invitedEmail = (invite.email as string | null)?.trim().toLowerCase() ?? null;
  if (invitedEmail && invitedEmail !== email) {
    fail("Esse convite foi feito para outro email. Use o email em que você foi convidada(o).");
  }

  // Reserva o convite ANTES de criar qualquer coisa. A condição
  // `accepted_at is null` faz o banco aceitar só a primeira reserva: dois
  // cadastros simultâneos com o mesmo link não passam os dois.
  const reservedAt = new Date().toISOString();
  const { data: reserved, error: reserveError } = await admin
    .from("household_invites")
    .update({ accepted_at: reservedAt })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .select("id");

  if (reserveError) fail("Não foi possível usar o convite agora. Tente de novo.");
  if (!reserved || reserved.length === 0) fail("Esse convite já foi usado.");

  // Se qualquer passo daqui pra frente falhar, desfaz o que foi feito:
  // apaga a conta criada e devolve o convite. Sem isso sobrava uma conta
  // órfã, e a próxima tentativa batia em "email já cadastrado".
  async function rollback(userId: string | null) {
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from("household_invites").update({ accepted_at: null }).eq("id", invite!.id);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !created.user) {
    await rollback(null);
    const alreadyExists =
      createError?.code === "email_exists" || /already|registered|exists/i.test(createError?.message ?? "");
    fail(
      alreadyExists
        ? "Esse email já tem uma conta no Velun. Fale com quem te convidou."
        : `Não foi possível criar a conta: ${createError?.message ?? "erro desconhecido"}`,
    );
  }

  const userId = created.user.id;

  const { error: memberError } = await admin.from("members").insert({
    id: userId,
    household_id: invite.household_id,
    display_name: name,
    color: "",
  });

  if (memberError) {
    await rollback(userId);
    fail("Não foi possível entrar na casa agora. Tente de novo.");
  }

  await admin.from("household_invites").update({ accepted_by: userId }).eq("id", invite.id);

  // Entra já logado(a): mesma senha que acabou de escolher.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  // A conta e a casa já existem; se só o login automático falhar, quem
  // chegou entra pela tela de login normalmente.
  if (signInError) redirect("/login");

  redirect("/mes");
}
