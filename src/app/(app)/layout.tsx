import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { ManualTransactionButton } from "@/components/manual-transaction-button";

const NAV = [
  { href: "/importar", label: "Importar" },
  { href: "/mes", label: "Mês" },
  { href: "/transacoes", label: "Transações" },
  { href: "/a-pagar", label: "A pagar" },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa" },
  { href: "/contas", label: "Contas" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("display_name, household_id, households(name)")
    .eq("id", user.id)
    .maybeSingle();

  // Sem tipos gerados do Supabase ainda, o builder infere `households`
  // como array — na prática é o objeto único do lado "many-to-one".
  const householdName = (
    member?.households as unknown as { name: string } | { name: string }[] | null
  );
  const household = Array.isArray(householdName) ? householdName[0] : householdName;

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("household_id", member?.household_id ?? "")
      .eq("is_archived", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("household_id", member?.household_id ?? "")
      .eq("is_archived", false)
      .order("name"),
  ]);

  return (
    <div className="min-h-screen bg-[--paper] text-[--ink]">
      <header className="flex items-center justify-between border-b border-[--rule] px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium">{household?.name ?? "Sem household"}</span>
          <nav className="flex gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-[--ink]/70 hover:text-[--ink]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ManualTransactionButton accounts={accounts ?? []} categories={categories ?? []} />
          <span className="text-sm text-[--ink]/70">{member?.display_name ?? user.email}</span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
