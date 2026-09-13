import { BarChart3, FolderKanban, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getCategoryColorMap } from "@/lib/category-colors";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { CategoryRow } from "./category-row";
import { NewCategoryDialog } from "./new-category-dialog";
import { DangerZone } from "./danger-zone";
import { InviteManager } from "./invite-manager";
import { CurrencySelect } from "./currency-select";

const BENEFITS = [
  { icon: BarChart3, label: "Acompanhar saldo e gastos", bg: "var(--badge-green-bg)", fg: "var(--badge-green-fg)" },
  { icon: FolderKanban, label: "Compartilhar categorias e contas", bg: "var(--badge-blue-bg)", fg: "var(--badge-blue-fg)" },
  { icon: Users, label: "Tomar decisões em conjunto", bg: "var(--badge-purple-bg)", fg: "var(--badge-purple-fg)" },
];

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={name}
      className="h-11 w-11 shrink-0 rounded-full border-2 border-(--bg-surface) object-cover"
    />
  ) : (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-(--bg-surface) text-sm font-semibold text-white"
      style={{ background: "var(--sidebar-active-gradient)" }}
    >
      {initial}
    </div>
  );
}

export default async function ConfiguracoesPage() {
  const { memberId, householdId, currency } = await getCurrentMember();
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
      .select("id, display_name, avatar_url")
      .eq("household_id", householdId)
      .order("created_at"),
    supabase
      .from("household_invites")
      .select("id, token, expires_at, email")
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
  let members: { id: string; display_name: string; avatar_url: string | null }[] = membersResult.data ?? [];
  if (withAvatar.error) {
    const [{ data: withoutAvatar }, { data: membersWithoutAvatar }] = await Promise.all([
      supabase.from("members").select("display_name").eq("id", memberId).maybeSingle(),
      supabase
        .from("members")
        .select("id, display_name")
        .eq("household_id", householdId)
        .order("created_at"),
    ]);
    member = withoutAvatar ? { ...withoutAvatar, avatar_url: null } : null;
    members = (membersWithoutAvatar ?? []).map((m) => ({ ...m, avatar_url: null }));
  }

  const categories = categoriesResult.data ?? [];
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const incomeCategories = categories.filter((c) => c.kind === "income");
  const pendingInvite = inviteResult.data
    ? {
        id: inviteResult.data.id,
        token: inviteResult.data.token,
        expiresAt: inviteResult.data.expires_at,
        email: inviteResult.data.email,
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

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "var(--primary-light)" }}
              >
                <Users className="h-5 w-5" style={{ color: "var(--primary)" }} />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-card-title">Orçamento compartilhado</h2>
                <p className="text-sm text-(--text-secondary)">
                  Convide pessoas para acompanhar suas finanças, compartilhar categorias e contas, e
                  tomar decisões em conjunto.
                </p>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {members.map((m) => (
                    <MemberAvatar key={m.id} name={m.display_name} avatarUrl={m.avatar_url} />
                  ))}
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed"
                    style={{ borderColor: "var(--border-primary)", color: "var(--text-light)" }}
                  >
                    <Plus className="h-4 w-4" />
                  </div>
                </div>
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: "var(--income-soft)", color: "var(--income-dark)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--income)" }} />
                  {members.length} {members.length === 1 ? "membro ativo" : "membros ativos"}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border-soft)" }}>
                <span className="text-sm font-medium text-(--text-primary)">Moeda do orçamento</span>
                <CurrencySelect currency={currency} />
              </div>
            </div>

            <InviteManager pendingInvite={pendingInvite} />
          </div>

          <div className="grid grid-cols-1 gap-3 border-t pt-5 sm:grid-cols-3" style={{ borderColor: "var(--border-soft)" }}>
            {BENEFITS.map((benefit) => (
              <div key={benefit.label} className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: benefit.bg }}
                >
                  <benefit.icon className="h-4 w-4" style={{ color: benefit.fg }} />
                </div>
                <span className="text-sm text-(--text-secondary)">{benefit.label}</span>
              </div>
            ))}
          </div>
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
