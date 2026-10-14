"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Manda o link de troca de senha. A resposta é a mesma exista ou não a
 * conta, pra ninguém usar a tela pra descobrir quem tem cadastro.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect(`/esqueci-senha?error=${encodeURIComponent("Informe seu email.")}`);

  // O endereço de onde a pessoa pediu (velunapp.com, o netlify ou o
  // localhost): o link do email volta pro mesmo lugar.
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/nova-senha`,
  });

  if (error && /rate limit|too many|seconds/i.test(error.message)) {
    redirect(
      `/esqueci-senha?error=${encodeURIComponent("Muitos pedidos seguidos. Espere alguns minutos e tente de novo.")}`,
    );
  }
  if (error) console.error("[esqueci-senha]", error.message);

  redirect(`/esqueci-senha?sent=1`);
}
