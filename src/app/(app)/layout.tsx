import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { logout } from "@/app/(auth)/login/actions";
import { ManualTransactionButton } from "@/components/manual-transaction-button";
import Image from "next/image";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { fetchDeletionRequests, fetchVisibilityNotifications } from "@/lib/notifications";
import { UserMenu } from "@/components/user-menu";
import { HideValuesButton } from "@/components/hide-values-button";
import { HIDE_VALUES_COOKIE } from "@/lib/hide-values";
import { cookies } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Mesma conferência de sessão e mesmo cadastro que a página usa: o
  // `getCurrentMember` é memorizado por requisição, então layout e página
  // dividem uma ida ao Supabase em vez de fazer cada um a sua.
  const member = await getCurrentMember();
  const supabase = await createClient();
  const hideValues = (await cookies()).get(HIDE_VALUES_COOKIE)?.value === "1";

  const [{ data: accounts }, { data: categories }, notifications, deletionRequests] = await Promise.all([
    // Só contas em que dá pra lançar: a do casal e as próprias. A conta
    // pessoal do outro pode estar visível, mas o banco recusa lançamento
    // nela — oferecer na lista seria convidar um erro.
    supabase
      .from("accounts")
      .select("id, name, type, institution")
      .eq("household_id", member.householdId)
      .eq("is_archived", false)
      .or(`owner_id.is.null,owner_id.eq.${member.memberId}`)
      .order("sort_order")
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind, icon, color, is_transfer")
      .eq("household_id", member.householdId)
      .eq("is_archived", false)
      .order("name"),
    fetchVisibilityNotifications(
      supabase,
      member.householdId,
      member.memberId,
      member.notificationsSeenAt,
    ),
    fetchDeletionRequests(supabase, member.householdId, member.memberId),
  ]);

  return (
    <div
      id="app-root"
      data-hide-values={hideValues ? "" : undefined}
      className="flex h-dvh overflow-hidden bg-(--paper) text-(--ink)"
    >
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 md:h-[76px] md:px-10">
          {/* No celular o menu lateral some: o logo ocupa o lugar da busca. */}
          <Link href="/mes" className="flex items-center gap-2 md:hidden" aria-label="Velun — início">
            <Image src="/velun-icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-[8px]" />
            <span className="text-[17px] font-bold tracking-[-0.02em] text-(--text-primary)">velun</span>
          </Link>
          <div className="hidden flex-1 md:block">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* O formulário fica montado nos dois tamanhos; no celular quem
                abre é o "+" da barra de baixo. */}
            <div className="hidden md:block">
              <ManualTransactionButton
                accounts={accounts ?? []}
                categories={categories ?? []}
                currency={member.currency}
              />
            </div>
            <HideValuesButton initialHidden={hideValues} />
            <NotificationBell
              notifications={notifications}
              deletionRequests={deletionRequests.filter((r) => !r.isMine)}
            />
            <UserMenu
              displayName={member.displayName}
              subtitle="Minha conta"
              avatarUrl={member.avatarUrl}
              onLogout={logout}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[calc(104px+env(safe-area-inset-bottom))] md:px-10 md:pt-4 md:pb-12">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
