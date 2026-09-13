import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentMember() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Erro de rede/timeout ao falar com o Supabase (comum, passageiro) não é
  // a mesma coisa que "sem sessão" — só quando o Supabase confirma que não
  // há usuário (ou não há sessão nenhuma) é que faz sentido ir pro login.
  // Do contrário a gente jogava fora uma sessão válida a cada instabilidade.
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error(`Falha ao verificar sessão, tente novamente: ${authError.message}`);
  }

  if (!user) {
    redirect("/login");
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("id, household_id")
    .eq("id", user.id)
    .single();

  if (error || !member) {
    throw new Error("Usuário autenticado sem membership em nenhum household.");
  }

  return { memberId: member.id as string, householdId: member.household_id as string };
}
