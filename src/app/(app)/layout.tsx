import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { logout } from "@/app/(auth)/login/actions";
import { ManualTransactionButton } from "@/components/manual-transaction-button";
import { Sidebar } from "@/components/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { fetchVisibilityNotifications } from "@/lib/notifications";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Mesma conferência de sessão e mesmo cadastro que a página usa: o
  // `getCurrentMember` é memorizado por requisição, então layout e página
  // dividem uma ida ao Supabase em vez de fazer cada um a sua.
  const member = await getCurrentMember();
  const supabase = await createClient();

  const [{ data: accounts }, { data: categories }, notifications] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("household_id", member.householdId)
      .eq("is_archived", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("household_id", member.householdId)
      .eq("is_archived", false)
      .order("name"),
    fetchVisibilityNotifications(
      supabase,
      member.householdId,
      member.memberId,
      member.notificationsSeenAt,
    ),
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
            <NotificationBell notifications={notifications} />
            <UserMenu
              displayName={member.displayName}
              subtitle="Dashboard Financeiro"
              avatarUrl={member.avatarUrl}
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
