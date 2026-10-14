"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = (message: string) => redirect(`/nova-senha?error=${encodeURIComponent(message)}`);

  if (password.length < 6) back("A senha precisa ter pelo menos 6 caracteres.");
  if (password !== confirm) back("As duas senhas não são iguais.");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/esqueci-senha?error=${encodeURIComponent("O link expirou. Peça um novo.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    back(
      /different from the old|same password/i.test(error.message)
        ? "Essa já é a sua senha. Escolha uma diferente."
        : /weak|short/i.test(error.message)
          ? "Senha fraca demais. Tente uma mais longa."
          : "Não deu pra salvar agora. Tente de novo.",
    );
  }

  redirect("/mes");
}
