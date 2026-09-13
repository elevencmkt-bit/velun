import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // /convite é a página pública de aceite de convite — quem não tem
  // conta ainda precisa conseguir abri-la sem ser jogado pro /login.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/convite");

  // Erro de rede/timeout ao consultar o Supabase (ex.: Gateway Timeout) não
  // significa que a sessão expirou — só que não deu pra confirmar agora.
  // Nesse caso deixamos a navegação passar em vez de chutar pro login;
  // só redireciona quando o Supabase respondeu e realmente não há usuário.
  const sessionCheckFailed = Boolean(error) && error?.name !== "AuthSessionMissingError";
  if (sessionCheckFailed) {
    console.error("[middleware] falha ao verificar sessão, deixando passar:", error?.message);
    return supabaseResponse;
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/mes";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
