import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifyClaims, type AuthCheck } from "@/lib/auth-check";
import type { CurrencyCode } from "@/lib/money";

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

/**
 * Quem está logado, conferido uma vez por requisição.
 *
 * `cache()` faz o layout e a página — que antes conferiam cada um por
 * conta própria — receberem a mesma resposta sem ir ao Supabase de novo.
 */
const getAuth = cache(async (): Promise<AuthCheck> => {
  const supabase = await createClient();
  return withRetry(
    async () => classifyClaims(await supabase.auth.getClaims()),
    (r) => r.status === "unavailable",
  );
});

/**
 * Membro logado e a casa dele. Uma busca por requisição, compartilhada
 * entre o layout (nome, foto, sino) e a página (casa, moeda).
 *
 * Antes eram duas buscas do mesmo cadastro, cada uma precedida de sua
 * própria conferência de sessão.
 */
export const getCurrentMember = cache(async () => {
  const auth = await getAuth();

  // Erro de rede/timeout ao falar com o Supabase (comum, passageiro) não é
  // a mesma coisa que "sem sessão" — só quando não há sessão (ou o token
  // não é válido) faz sentido ir pro login. Do contrário a gente jogava
  // fora uma sessão válida a cada instabilidade.
  if (auth.status === "unavailable") {
    throw new Error(`Falha ao verificar sessão, tente novamente: ${auth.message}`);
  }
  if (auth.status === "no-session") {
    redirect("/login");
  }

  const supabase = await createClient();

  const { data: member, error } = await withRetry(
    () =>
      supabase
        .from("members")
        .select(
          "id, household_id, display_name, avatar_url, notifications_seen_at, households(currency)",
        )
        .eq("id", auth.userId)
        .single(),
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

  // Sem tipos gerados do Supabase ainda, o builder infere `households`
  // como array — na prática é o objeto único do lado "many-to-one".
  const householdRaw = member.households as unknown as { currency: string } | { currency: string }[] | null;
  const household = Array.isArray(householdRaw) ? householdRaw[0] : householdRaw;
  const currency = (household?.currency as CurrencyCode) ?? "USD";

  return {
    memberId: member.id as string,
    householdId: member.household_id as string,
    currency,
    displayName: (member.display_name as string | null) ?? auth.email ?? "Você",
    avatarUrl: (member.avatar_url as string | null) ?? null,
    notificationsSeenAt: (member.notifications_seen_at as string | null) ?? null,
  };
});
