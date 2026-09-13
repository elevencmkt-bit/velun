import { HeartHandshake } from "lucide-react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--paper) p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 pb-2">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--sidebar-active-bg)" }}
          >
            <HeartHandshake className="h-6 w-6 text-white" />
          </div>
          <CardTitle>Entrar</CardTitle>
        </CardHeader>
        <CardContent>
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
