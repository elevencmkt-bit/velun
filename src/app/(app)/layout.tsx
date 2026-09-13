import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { ManualTransactionButton } from "@/components/manual-transaction-button";
import { Sidebar } from "@/components/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const withAvatar = await supabase
    .from("members")
    .select("display_name, avatar_url, household_id, households(name)")
    .eq("id", user.id)
    .maybeSingle();

  // avatar_url pode ainda não existir se a migração 0003 não rodou —
  // refaz sem a coluna em vez de derrubar o layout inteiro nesse caso.
  let member: {
    display_name: string;
    avatar_url: string | null;
    household_id: string;
    households: unknown;
  } | null = withAvatar.data;

  if (withAvatar.error) {
    const { data: withoutAvatar } = await supabase
      .from("members")
      .select("display_name, household_id, households(name)")
      .eq("id", user.id)
      .maybeSingle();
    member = withoutAvatar ? { ...withoutAvatar, avatar_url: null } : null;
  }

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
    <div className="flex min-h-screen bg-(--paper) text-(--ink)">
      <Sidebar householdName={household?.name ?? "Sem household"} />
      <div className="flex flex-1 flex-col">
        <header
          className="flex h-[72px] shrink-0 items-center justify-between border-b px-7"
          style={{ backgroundColor: "rgba(255,255,255,.92)", borderColor: "var(--border-primary)" }}
        >
          <GlobalSearch />
          <div className="flex items-center gap-2">
            <ManualTransactionButton accounts={accounts ?? []} categories={categories ?? []} />
            <NotificationBell />
            <UserMenu
              displayName={member?.display_name ?? user.email ?? "Você"}
              subtitle={household?.name ?? "Conta compartilhada"}
              avatarUrl={member?.avatar_url ?? null}
              onLogout={logout}
            />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-7 pt-6 pb-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
