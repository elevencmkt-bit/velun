import Link from "next/link";
import { login } from "./actions";
import {
  AuthField,
  AuthShell,
  authInputClass,
} from "@/components/auth/auth-shell";
import { PasswordInput, SubmitButton } from "@/components/auth/auth-controls";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirm?: string }>;
}) {
  const { error, confirm } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
        Que bom te ver
      </h1>
      <p className="mt-2 text-[15px] text-(--text-muted)">
        Entre pra ver como estão as contas da casa.
      </p>

      {confirm ? (
        <p className="mt-6 rounded-[14px] bg-(--income-soft) px-4 py-3 text-sm text-(--income-dark)">
          Conta criada! Confirme seu email antes de entrar (verifique sua caixa
          de entrada).
        </p>
      ) : null}

      <form action={login} className="mt-8 flex flex-col gap-5">
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
        <AuthField label="Senha" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
          />
        </AuthField>
        <Link
          href="/esqueci-senha"
          className="-mt-2 self-end text-[13px] font-semibold text-(--primary) hover:underline"
        >
          Esqueci minha senha
        </Link>
        {error ? (
          <p
            className="rounded-[14px] bg-(--expense-soft) px-4 py-3 text-sm text-(--expense-dark)"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
      </form>
    </AuthShell>
  );
}
