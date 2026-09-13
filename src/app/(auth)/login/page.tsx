import Image from "next/image";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirm?: string }>;
}) {
  const { error, confirm } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--paper) p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 pb-2">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl">
            <Image src="/velun-icon.png" alt="Velun" width={44} height={44} className="h-full w-full" />
          </div>
          <span className="text-lg font-bold text-(--text-primary)">Velun</span>
          <CardTitle>Entrar</CardTitle>
        </CardHeader>
        <CardContent>
          {confirm ? (
            <p className="mb-4 text-sm text-(--text-secondary)">
              Conta criada! Confirme seu email antes de entrar (verifique sua caixa de entrada).
            </p>
          ) : null}
          <form action={login} className="flex flex-col gap-4">
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
                autoComplete="current-password"
              />
            </div>
            {error ? <p className="text-sm text-(--out)">{error}</p> : null}
            <Button type="submit">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
