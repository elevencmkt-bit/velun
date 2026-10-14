import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Volta dos links que o Supabase manda por email (hoje: trocar a senha).
// Aceita os dois formatos:
// - `?code=…` (o padrão): funciona no mesmo navegador que pediu o link;
// - `?token_hash=…&type=recovery` (modelo de email ajustado no Supabase):
//   funciona em qualquer aparelho.
// Deu certo: a pessoa entra com uma sessão e segue pro `next`.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/mes";
  // Só caminhos daqui de dentro: nada de mandar pra outro site.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/mes";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const target = url.clone();
  target.search = "";
  if (ok) {
    target.pathname = next;
  } else {
    target.pathname = "/esqueci-senha";
    target.searchParams.set(
      "error",
      "Esse link expirou ou já foi usado. Peça um novo aqui embaixo (e abra no mesmo navegador).",
    );
  }
  return NextResponse.redirect(target);
}
