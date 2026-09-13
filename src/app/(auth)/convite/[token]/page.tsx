import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptInvite } from "@/lib/actions/accept-invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    .select("id, expires_at, accepted_at, created_by")
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
    <div className="flex min-h-screen items-center justify-center bg-(--paper) p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 pb-2">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl">
            <Image src="/velun-icon.png" alt="Velun" width={44} height={44} className="h-full w-full" />
          </div>
          <span className="text-lg font-bold text-(--text-primary)">Velun</span>
          <CardTitle>{isValid ? "Você foi convidado(a)" : "Convite indisponível"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!isValid ? (
            <p className="text-sm text-(--text-muted)">
              {!invite
                ? "Esse link de convite não é válido."
                : isUsed
                  ? "Esse convite já foi usado."
                  : "Esse convite expirou. Peça um novo link pra quem te convidou."}
            </p>
          ) : (
            <form action={acceptInvite.bind(null, token)} className="flex flex-col gap-4">
              {inviterName ? (
                <p className="text-sm text-(--text-secondary)">
                  {inviterName} te convidou para compartilhar as finanças no Velun.
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" name="name" required autoComplete="name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </div>
              {error ? <p className="text-sm text-(--out)">{error}</p> : null}
              <Button type="submit">Criar conta e entrar</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
