import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { ManualTransactionButton } from "@/components/manual-transaction-button";
import { Sidebar } from "@/components/sidebar";
import { GlobalSearch } from "@/components/global-search";

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
    <div className="flex min-h-screen bg-[--paper] text-[--ink]">
      <Sidebar householdName={household?.name ?? "Sem household"} />
      <div className="flex flex-1 flex-col">
        <header
          className="flex h-[66px] shrink-0 items-center justify-between border-b px-7"
          style={{ backgroundColor: "rgba(255,255,255,.92)", borderColor: "var(--border-primary)" }}
        >
          <GlobalSearch />
          <div className="flex items-center gap-3">
            <ManualTransactionButton accounts={accounts ?? []} categories={categories ?? []} />
            <span className="text-[13px] text-[--text-secondary]">
              {member?.display_name ?? user.email}
            </span>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-7 pt-6 pb-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
