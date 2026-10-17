import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/auth-controls";
import { lookupToken } from "@/lib/email/unsubscribe";
import { EMAIL_KIND_LABEL } from "@/lib/email/context";
import { confirmUnsubscribe } from "./actions";

export const metadata: Metadata = { title: "Parar de receber · Velun" };

// Aberta sem login: é o link do rodapé dos e-mails.
export default async function SairPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; k?: string; feito?: string; erro?: string }>;
}) {
  const { t = "", k = "", feito, erro } = await searchParams;
  const found = await lookupToken(t, k);

  if (!found) {
    return (
      <AuthShell>
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
          Link inválido
        </h1>
        <p className="mt-2 text-[15px] text-(--text-muted)">
          Esse link de &ldquo;parar de receber&rdquo; não vale mais. Entre no Velun e ajuste os e-mails em
          Configurações.
        </p>
        <Link href="/configuracoes#emails" className="mt-8 block text-center text-sm font-semibold text-(--primary) hover:underline">
          Abrir Configurações
        </Link>
      </AuthShell>
    );
  }

  const label = EMAIL_KIND_LABEL[found.kind];
  const done = feito || !found.on;

  return (
    <AuthShell>
      <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-(--text-primary)">
        {done ? "Pronto" : `Parar de receber ${label}?`}
      </h1>
      {done ? (
        <div className="mt-8 flex flex-col gap-5">
          <p className="rounded-[14px] bg-(--income-soft) px-4 py-3 text-sm leading-relaxed text-(--income-dark)" role="status">
            Você não recebe mais {label}. Os outros e-mails continuam como estão.
          </p>
          <Link href="/configuracoes#emails" className="text-center text-sm font-semibold text-(--primary) hover:underline">
            Mudou de ideia? Ligue de novo em Configurações
          </Link>
        </div>
      ) : (
        <form action={confirmUnsubscribe} className="mt-8 flex flex-col gap-5">
          <input type="hidden" name="t" value={t} />
          <input type="hidden" name="k" value={k} />
          <p className="text-[15px] text-(--text-muted)">
            Os outros e-mails do Velun continuam chegando. Dá pra ligar de novo quando quiser, em Configurações.
          </p>
          {erro ? (
            <p className="rounded-[14px] bg-(--expense-soft) px-4 py-3 text-sm text-(--expense-dark)" role="alert">
              Não deu certo agora. Tente de novo em alguns minutos.
            </p>
          ) : null}
          <SubmitButton pendingLabel="Salvando…">Parar de receber</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
