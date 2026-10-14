import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { AuthField, AuthShell, authInputClass } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/auth-controls";

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
        Esqueceu a senha?
      </h1>
      <p className="mt-2 text-[15px] text-(--text-muted)">
        Diga seu email e mandamos um link pra criar uma senha nova.
      </p>

      {sent ? (
        <div className="mt-8 flex flex-col gap-5">
          <p className="rounded-[14px] bg-(--income-soft) px-4 py-3 text-sm leading-relaxed text-(--income-dark)" role="status">
            Se esse email tiver conta no Velun, o link já está a caminho. Ele vale por 1 hora; olhe também o spam.
          </p>
          <Link href="/login" className="text-center text-sm font-semibold text-(--primary) hover:underline">
            Voltar pra entrar
          </Link>
        </div>
      ) : (
        <form action={requestPasswordReset} className="mt-8 flex flex-col gap-5">
          <AuthField label="Email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
              className={authInputClass}
            />
          </AuthField>
          {error ? (
            <p className="rounded-[14px] bg-(--expense-soft) px-4 py-3 text-sm text-(--expense-dark)" role="alert">
              {error}
            </p>
          ) : null}
          <SubmitButton pendingLabel="Enviando…">Mandar o link</SubmitButton>
          <Link href="/login" className="text-center text-sm font-semibold text-(--primary) hover:underline">
            Lembrei, voltar pra entrar
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
