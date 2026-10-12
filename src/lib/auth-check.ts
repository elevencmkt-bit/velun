// Decisão única de "quem está logado", compartilhada entre o porteiro
// (middleware) e o servidor das páginas.
//
// A identidade vem de `getClaims()` e não mais de `getUser()`. O
// `getUser()` vai ao servidor de autenticação do Supabase a cada
// chamada, e cada clique no app chamava três vezes (porteiro, layout,
// página) — três idas e voltas pra mesma resposta. O `getClaims()`
// confere a assinatura do token: localmente, quando o projeto usa as
// chaves de assinatura assimétricas; e, quando usa o segredo antigo,
// indo ao servidor exatamente como o `getUser()`. Nunca é mais lento
// e nunca é menos seguro.
//
// Arquivo sem dependência de servidor do Next de propósito: o
// middleware também importa daqui.

export type AuthCheck =
  | { status: "ok"; userId: string; email: string | null }
  | { status: "no-session" }
  | { status: "unavailable"; message: string };

type ClaimsResult = {
  data: { claims: { sub?: string; email?: string } } | null;
  error: { name?: string; message: string } | null;
};

/**
 * Traduz o resultado de `getClaims()` nos três casos que importam.
 *
 * - sem sessão: `getClaims()` devolve dados vazios SEM erro (o
 *   `getUser()` devolvia um erro específico — por isso não dá pra
 *   simplesmente trocar uma função pela outra);
 * - token inválido (assinatura não confere): também é "sem sessão" —
 *   quem apresenta um token falso vai pro login, não passa;
 * - qualquer outro erro é rede ou instabilidade do Supabase: a sessão
 *   pode estar perfeitamente válida, só não deu pra confirmar agora. Não
 *   joga ninguém pro login por causa disso.
 */
export function classifyClaims(result: ClaimsResult): AuthCheck {
  const { data, error } = result;

  if (error) {
    if (error.name === "AuthSessionMissingError" || error.name === "AuthInvalidJwtError") {
      return { status: "no-session" };
    }
    return { status: "unavailable", message: error.message };
  }

  const userId = data?.claims?.sub;
  if (!userId) return { status: "no-session" };

  return { status: "ok", userId, email: data.claims.email ?? null };
}
