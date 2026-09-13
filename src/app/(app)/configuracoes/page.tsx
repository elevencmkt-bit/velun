import { ChartNoAxesColumnIncreasing, Folder, Plus, UserRoundCheck, UsersRound } from "lucide-react";
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
  { icon: ChartNoAxesColumnIncreasing, label: "Acompanhar saldo e gastos", bg: "#E9FBF2", fg: "#19B86A" },
  { icon: Folder, label: "Compartilhar categorias e contas", bg: "#F0EDFF", fg: "#7056EB" },
  { icon: UserRoundCheck, label: "Tomar decisões em conjunto", bg: "#FFF0F3", fg: "#F04469" },
];

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex flex-col items-center gap-1.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-[42px] w-[42px] shrink-0 rounded-full border-2 border-(--bg-surface) object-cover"
          style={{ boxShadow: "0 0 0 1px var(--border-soft), 0 3px 8px rgba(16,24,40,.08)" }}
        />
      ) : (
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border-2 border-(--bg-surface) text-sm font-semibold text-white"
          style={{
            background: "var(--sidebar-active-gradient)",
            boxShadow: "0 0 0 1px var(--border-soft), 0 3px 8px rgba(16,24,40,.08)",
          }}
        >
          {initial}
        </div>
      )}
      <span className="max-w-[64px] truncate text-[11px] font-semibold text-(--text-primary)">{name}</span>
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

      <section
        className="relative overflow-hidden rounded-2xl border"
        style={{
          borderColor: "#CCD3FF",
          background:
            "radial-gradient(circle at 38% 15%, rgba(91,108,255,0.10), transparent 34%), linear-gradient(135deg, #FFFFFF 0%, #F9FAFF 58%, #F4F6FF 100%)",
          boxShadow: "0 8px 24px rgba(20,28,60,.04)",
        }}
      >
        <div className="grid grid-cols-1 gap-7 p-7 pb-5 md:[grid-template-columns:minmax(0,1fr)_1px_minmax(460px,1.12fr)]">
          {/* COLUNA ESQUERDA */}
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: "linear-gradient(135deg, #E9EDFF 0%, #DDE4FF 100%)" }}
              >
                <UsersRound className="h-5 w-5" style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <h3 className="mb-1.5 text-[18px] leading-tight font-bold tracking-tight text-(--text-primary)">
                  Orçamento compartilhado
                </h3>
                <p className="max-w-[460px] text-sm leading-relaxed text-(--text-secondary)">
                  Convide pessoas para acompanhar suas finanças, compartilhar categorias e contas, e
                  tomar decisões em conjunto.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-start gap-3">
              {members.map((m) => (
                <MemberAvatar key={m.id} name={m.display_name} avatarUrl={m.avatar_url} />
              ))}
              <button
                type="button"
                aria-label="Adicionar membro"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-dashed transition-colors"
                style={{ borderColor: "#B9C2DF", color: "var(--primary)", backgroundColor: "rgba(255,255,255,.65)" }}
              >
                <Plus className="h-4 w-4" />
              </button>
              <span
                className="ml-1 inline-flex h-[42px] w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
                style={{ backgroundColor: "var(--income-soft)", color: "#297A50" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--income)" }} />
                {members.length} {members.length === 1 ? "membro ativo" : "membros ativos"}
              </span>
            </div>
          </div>

          {/* DIVISOR */}
          <div
            className="hidden md:block"
            style={{
              background: "linear-gradient(to bottom, transparent, #E0E5F2 12%, #E0E5F2 88%, transparent)",
            }}
          />

          {/* COLUNA DIREITA */}
          <InviteManager pendingInvite={pendingInvite} />
        </div>

        {/* MOEDA */}
        <div
          className="flex flex-col items-start gap-2 border-t px-7 py-3.5 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "rgba(230,234,242,.9)" }}
        >
          <div>
            <strong className="block text-xs font-semibold text-(--text-primary)">Moeda do orçamento</strong>
            <span className="mt-0.5 block text-[11px] text-(--text-light)">
              Usada nos lançamentos e relatórios deste orçamento.
            </span>
          </div>
          <CurrencySelect currency={currency} />
        </div>

        {/* BENEFÍCIOS */}
        <div
          className="grid grid-cols-1 border-t sm:grid-cols-3"
          style={{ borderColor: "rgba(230,234,242,.85)", backgroundColor: "rgba(255,255,255,.35)" }}
        >
          {BENEFITS.map((benefit, i) => (
            <div
              key={benefit.label}
              className={`flex min-h-[58px] items-center justify-center gap-2.5 border-[rgba(230,234,242,.8)] px-5 py-2.5 sm:justify-start ${
                i > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <div
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
                style={{ backgroundColor: benefit.bg, color: benefit.fg }}
              >
                <benefit.icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] leading-tight text-(--text-secondary)">{benefit.label}</span>
            </div>
          ))}
        </div>
      </section>

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
