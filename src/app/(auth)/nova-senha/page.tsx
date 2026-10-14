import { redirect } from "next/navigation";
import { updatePassword } from "./actions";
import { AuthField, AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput, SubmitButton } from "@/components/auth/auth-controls";
import { createClient } from "@/lib/supabase/server";

// Chega aqui pelo link do email (que já abriu uma sessão) ou logado,
// pra trocar a senha.
export default async function NovaSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/esqueci-senha?error=${encodeURIComponent("O link expirou. Peça um novo.")}`);
  }

  return (
    <AuthShell>
      <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
        Crie uma senha nova
      </h1>
      <p className="mt-2 text-[15px] text-(--text-muted)">
        Pra {data.user.email}. Depois de salvar, você já entra.
      </p>

      <form action={updatePassword} className="mt-8 flex flex-col gap-5">
        <AuthField label="Senha nova" htmlFor="password">
          <PasswordInput id="password" name="password" autoComplete="new-password" />
        </AuthField>
        <AuthField label="Repita a senha" htmlFor="confirm">
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" />
        </AuthField>
        {error ? (
          <p className="rounded-[14px] bg-(--expense-soft) px-4 py-3 text-sm text-(--expense-dark)" role="alert">
            {error}
          </p>
        ) : null}
        <SubmitButton pendingLabel="Salvando…">Salvar e entrar</SubmitButton>
      </form>
    </AuthShell>
  );
}
