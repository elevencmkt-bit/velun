import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getCategoryColorMap } from "@/lib/category-colors";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { CategoryRow } from "./category-row";
import { NewCategoryDialog } from "./new-category-dialog";
import { DangerZone } from "./danger-zone";
import { InviteManager } from "./invite-manager";

export default async function ConfiguracoesPage() {
  const { memberId, householdId } = await getCurrentMember();
  const supabase = await createClient();

  const [withAvatar, categoriesResult, colorMap, membersResult, inviteResult] = await Promise.all([
    supabase.from("members").select("display_name, avatar_url").eq("id", memberId).maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, kind, color")
      .eq("household_id", householdId)
      .order("name"),
    getCategoryColorMap(supabase, householdId),
    supabase
      .from("members")
      .select("id, display_name")
      .eq("household_id", householdId)
      .order("created_at"),
    supabase
      .from("household_invites")
      .select("id, token, expires_at")
      .eq("household_id", householdId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // avatar_url pode ainda não existir se a migração 0003 não rodou —
  // refaz sem a coluna em vez de perder o nome também.
  let member: { display_name: string; avatar_url: string | null } | null = withAvatar.data;
  if (withAvatar.error) {
    const { data: withoutAvatar } = await supabase
      .from("members")
      .select("display_name")
      .eq("id", memberId)
      .maybeSingle();
    member = withoutAvatar ? { ...withoutAvatar, avatar_url: null } : null;
  }

  const categories = categoriesResult.data ?? [];
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const incomeCategories = categories.filter((c) => c.kind === "income");
  const members = membersResult.data ?? [];
  const pendingInvite = inviteResult.data
    ? {
        id: inviteResult.data.id,
        token: inviteResult.data.token,
        expiresAt: inviteResult.data.expires_at,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title">Configurações</h1>
        <p className="text-page-subtitle">Seu perfil, categorias e dados do household.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-card-title">Perfil</h2>
          <ProfileForm name={member?.display_name ?? ""} avatarUrl={member?.avatar_url ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title">Household</h2>
            <p className="text-metadata">
              {members.length === 0
                ? "Ninguém cadastrado ainda."
                : members.map((m) => m.display_name).join(" · ")}
            </p>
          </div>
          <InviteManager pendingInvite={pendingInvite} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title">Categorias</h2>
            <NewCategoryDialog />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-metadata mb-1">Despesas</span>
              {expenseCategories.length === 0 ? (
                <p className="text-sm text-(--text-muted)">Nenhuma categoria de despesa ainda.</p>
              ) : (
                expenseCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    effectiveColor={colorMap.get(category.name)?.fg ?? null}
                  />
                ))
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-metadata mb-1">Receitas</span>
              {incomeCategories.length === 0 ? (
                <p className="text-sm text-(--text-muted)">Nenhuma categoria de receita ainda.</p>
              ) : (
                incomeCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    effectiveColor={colorMap.get(category.name)?.fg ?? null}
                  />
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}
