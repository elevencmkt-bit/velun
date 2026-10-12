"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // A mensagem do Supabase vem em inglês e técnica; quem está entrando
    // precisa de uma frase que diga o que fazer.
    const message =
      error.code === "invalid_credentials" ||
      /invalid login credentials/i.test(error.message)
        ? "Email ou senha incorretos."
        : error.code === "email_not_confirmed" ||
            /not confirmed/i.test(error.message)
          ? "Confirme seu email antes de entrar."
          : /rate limit|too many/i.test(error.message)
            ? "Muitas tentativas seguidas. Espere um minuto e tente de novo."
            : "Não deu pra entrar agora. Tente de novo em instantes.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  redirect("/mes");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
