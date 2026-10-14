import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyClaims } from "@/lib/auth-check";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Mesma decisão que o servidor das páginas usa (src/lib/auth-check.ts):
  // `getClaims()` confere a assinatura do token em vez de perguntar ao
  // servidor de autenticação a cada clique, e renova a sessão quando o
  // token está pra vencer — que é o trabalho do porteiro.
  const auth = classifyClaims(await supabase.auth.getClaims());

  // /convite é a página pública de aceite de convite — quem não tem
  // conta ainda precisa conseguir abri-la sem ser jogado pro /login.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/convite");

  // Central de ajuda: pública, abre com ou sem sessão.
  if (request.nextUrl.pathname === "/ajuda" || request.nextUrl.pathname.startsWith("/ajuda/")) {
    return supabaseResponse;
  }

  // Erro de rede/timeout ao consultar o Supabase (ex.: Gateway Timeout) não
  // significa que a sessão expirou — só que não deu pra confirmar agora.
  // Nesse caso deixamos a navegação passar em vez de chutar pro login;
  // a página confere de novo e, sem sessão, redireciona ela mesma.
  if (auth.status === "unavailable") {
    console.error("[middleware] falha ao verificar sessão, deixando passar:", auth.message);
    return supabaseResponse;
  }

  if (auth.status === "no-session" && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (auth.status === "ok" && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/mes";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
