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
    .select("display_name, avatar_url, household_id")
    .eq("id", user.id)
    .maybeSingle();

  // avatar_url pode ainda não existir se a migração 0003 não rodou —
  // refaz sem a coluna em vez de derrubar o layout inteiro nesse caso.
  let member: { display_name: string; avatar_url: string | null; household_id: string } | null =
    withAvatar.data;

  if (withAvatar.error) {
    const { data: withoutAvatar } = await supabase
      .from("members")
      .select("display_name, household_id")
      .eq("id", user.id)
      .maybeSingle();
    member = withoutAvatar ? { ...withoutAvatar, avatar_url: null } : null;
  }

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
    <div className="flex h-screen overflow-hidden bg-(--paper) text-(--ink)">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col">
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
              subtitle="Dashboard Financeiro"
              avatarUrl={member?.avatar_url ?? null}
              onLogout={logout}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-8">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
