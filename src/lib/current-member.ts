import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// getCurrentMember roda em toda página e toda server action — um
// timeout passageiro do Supabase aqui trava qualquer ação do app (ex.:
// lançar uma transação). Antes de virar erro pro usuário, tenta de
// novo algumas vezes; só desiste se continuar falhando.
async function withRetry<T>(fn: () => PromiseLike<T>, shouldRetry: (result: T) => boolean): Promise<T> {
  let result = await fn();
  for (let attempt = 1; attempt < RETRY_ATTEMPTS && shouldRetry(result); attempt++) {
    await sleep(RETRY_DELAY_MS * attempt);
    result = await fn();
  }
  return result;
}

export async function getCurrentMember() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await withRetry(
    () => supabase.auth.getUser(),
    (r) => Boolean(r.error) && r.error?.name !== "AuthSessionMissingError",
  );

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

  const { data: member, error } = await withRetry(
    () => supabase.from("members").select("id, household_id").eq("id", user.id).single(),
    (r) => Boolean(r.error) && r.error?.code !== "PGRST116",
  );

  // PGRST116 = .single() não achou nenhuma linha — aí sim não há
  // membership. Qualquer outro erro (rede, timeout) é passageiro e não
  // deve virar essa mensagem enganosa; melhor deixar recarregar.
  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao carregar membership, tente novamente: ${error.message}`);
  }
  if (!member) {
    throw new Error("Usuário autenticado sem membership em nenhum household.");
  }

  return { memberId: member.id as string, householdId: member.household_id as string };
}
