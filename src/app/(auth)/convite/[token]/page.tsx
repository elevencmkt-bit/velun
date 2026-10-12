import { createAdminClient } from "@/lib/supabase/admin";
import { acceptInvite } from "@/lib/actions/accept-invite";
import {
  AuthField,
  AuthShell,
  authInputClass,
} from "@/components/auth/auth-shell";
import { PasswordInput, SubmitButton } from "@/components/auth/auth-controls";

export default async function ConvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("household_invites")
    .select("id, expires_at, accepted_at, created_by, email")
    .eq("token", token)
    .maybeSingle();

  let inviterName: string | null = null;
  if (invite) {
    const { data: inviter } = await admin
      .from("members")
      .select("display_name")
      .eq("id", invite.created_by)
      .maybeSingle();
    inviterName = inviter?.display_name ?? null;
  }

  const isExpired = invite ? new Date(invite.expires_at) < new Date() : false;
  const isUsed = Boolean(invite?.accepted_at);
  const isValid = Boolean(invite) && !isExpired && !isUsed;

  return (
    <AuthShell>
      {!isValid ? (
        <>
          <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
            Convite indisponível
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-(--text-muted)">
            {!invite
              ? "Esse link de convite não é válido."
              : isUsed
                ? "Esse convite já foi usado. Se a conta é sua, é só entrar."
                : "Esse convite expirou. Peça um novo link pra quem te convidou."}
          </p>
          <a
            href="/login"
            className="mt-8 flex h-12 w-full items-center justify-center rounded-[14px] bg-(--primary) text-[15px] font-semibold text-white"
          >
            Ir pra tela de entrar
          </a>
        </>
      ) : (
        <>
          <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
            {inviterName
              ? `${inviterName.split(" ")[0]} te chamou pro Velun`
              : "Você foi convidado(a)"}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-(--text-muted)">
            Crie sua conta pra dividir as finanças da casa. Suas contas pessoais
            continuam suas: você escolhe o que aparece pro outro.
          </p>

          <form
            action={acceptInvite.bind(null, token)}
            className="mt-8 flex flex-col gap-5"
          >
            <AuthField label="Seu nome" htmlFor="name">
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                className={authInputClass}
              />
            </AuthField>
            <AuthField label="Email" htmlFor="email">
              {/* Convite feito pra um email: ele já vem preenchido e travado —
                  só esse email consegue usar o link. */}
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={invite?.email ?? undefined}
                readOnly={Boolean(invite?.email)}
                className={authInputClass}
              />
            </AuthField>
            <AuthField label="Crie uma senha" htmlFor="password">
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
              />
            </AuthField>
            {error ? (
              <p
                className="rounded-[14px] bg-(--expense-soft) px-4 py-3 text-sm text-(--expense-dark)"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <SubmitButton pendingLabel="Criando sua conta…">
              Criar conta e entrar
            </SubmitButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
