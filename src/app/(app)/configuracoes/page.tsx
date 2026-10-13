import { ChartNoAxesColumnIncreasing, Folder, Plus, UserRoundCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";
import { getCategoryColorMap } from "@/lib/category-colors";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { CategoriesPanel } from "./categories-panel";
import { DangerZone } from "./danger-zone";
import { InviteManager } from "./invite-manager";
import { HouseholdSettingsForm } from "./household-settings-form";
import { themedBg, themedFg } from "@/lib/theme-color";

const BENEFITS = [
  { icon: ChartNoAxesColumnIncreasing, label: "Acompanhar saldo e gastos", bg: "#E9FBF2", fg: "#19B86A" },
  { icon: Folder, label: "Escolher o que cada conta mostra", bg: "#F0EDFF", fg: "#7056EB" },
  { icon: UserRoundCheck, label: "Tomar decisões em conjunto", bg: "#FFF0F3", fg: "#F04469" },
];

function MemberRow({
  name,
  avatarUrl,
  note,
}: {
  name: string;
  avatarUrl: string | null;
  note: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-white/80 p-2.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ background: "var(--sidebar-active-gradient)" }}
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-(--text-primary)">{name}</div>
        <div className="text-xs text-(--text-muted)">{note}</div>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ backgroundColor: "var(--income-soft)", color: "var(--income-dark)" }}
      >
        Ativo
      </span>
    </div>
  );
}

export default async function ConfiguracoesPage() {
  const { memberId, householdId, currency, country, timezone } = await getCurrentMember();
  const supabase = await createClient();

  const [withAvatar, categoriesResult, colorMap, membersResult, inviteResult] = await Promise.all([
    supabase.from("members").select("display_name, avatar_url").eq("id", memberId).maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, kind, color, icon, is_transfer")
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
  const expenseCategories = categories.filter((c) => c.kind === "expense" && !c.is_transfer);
  const incomeCategories = categories.filter((c) => c.kind === "income" && !c.is_transfer);
  const transferCategories = categories.filter((c) => c.is_transfer);
  const pendingInvite = inviteResult.data
    ? {
        id: inviteResult.data.id,
        token: inviteResult.data.token,
        expiresAt: inviteResult.data.expires_at,
        email: inviteResult.data.email,
      }
    : null;

  const toItem = (c: (typeof categories)[number]) => ({
    category: c,
    color: colorMap.get(c.name)?.fg ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title">Configurações</h1>
        <p className="text-page-subtitle">Você, sua casa, quem divide com você e as categorias.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardContent className="flex flex-col gap-5">
            <div>
              <h2 className="text-card-title">Perfil</h2>
              <p className="mt-1 text-sm text-(--text-muted)">Como você aparece pra quem divide a casa.</p>
            </div>
            <ProfileForm name={member?.display_name ?? ""} avatarUrl={member?.avatar_url ?? null} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardContent className="flex flex-1 flex-col gap-5">
            <div>
              <h2 className="text-card-title">Sua casa</h2>
              <p className="mt-1 text-sm text-(--text-muted)">Vale pra todo mundo da casa. A moeda nunca é convertida.</p>
            </div>
            <HouseholdSettingsForm country={country} timezone={timezone} currency={currency} />
          </CardContent>
        </Card>
      </div>

      {/* Pessoas da casa: o diferencial do Velun, por isso o degradê azul. */}
      <section
        className="overflow-hidden rounded-[20px]"
        style={{
          background:
            "radial-gradient(circle at 38% 15%, rgba(91,108,255,0.10), transparent 34%), linear-gradient(135deg, #FFFFFF 0%, #F9FAFF 58%, #F4F6FF 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="grid grid-cols-1 gap-6 p-5 md:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
          <div className="min-w-0">
            <h2 className="text-card-title">Pessoas da casa</h2>
            <p className="mt-1 max-w-[460px] text-sm leading-relaxed text-(--text-muted)">
              Contas do casal ficam abertas pros dois. Nas suas contas pessoais, você escolhe o que o
              outro vê — nada, só o saldo, os gastos por categoria ou tudo.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {members.map((m, i) => (
                <MemberRow
                  key={m.id}
                  name={m.display_name}
                  avatarUrl={m.avatar_url}
                  note={[m.id === memberId ? "Você" : null, i === 0 ? "criou a casa" : null].filter(Boolean).join(" · ") || "Na casa"}
                />
              ))}
              <a
                href="#convite"
                className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-(--border-strong) p-2.5 text-(--primary) transition-colors hover:bg-white/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--primary-light)">
                  <Plus className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">Convidar alguém</span>
                  <span className="block text-xs text-(--text-muted)">A pessoa entra na casa com a conta dela</span>
                </span>
              </a>
            </div>
          </div>

          <InviteManager pendingInvite={pendingInvite} />
        </div>

        <div
          className="grid grid-cols-1 border-t sm:grid-cols-3"
          style={{ borderColor: "rgba(230,234,242,.85)", backgroundColor: "rgba(255,255,255,.35)" }}
        >
          {BENEFITS.map((benefit, i) => (
            <div
              key={benefit.label}
              className={`flex min-h-[58px] items-center gap-3 border-[rgba(230,234,242,.8)] px-5 py-3 md:px-7 ${
                i > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <div
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: themedBg(benefit.bg, benefit.fg), color: themedFg(benefit.fg) }}
              >
                <benefit.icon className="h-4 w-4" />
              </div>
              <span className="text-[13px] leading-tight text-(--text-secondary)">{benefit.label}</span>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <CardContent>
          <CategoriesPanel
            expense={expenseCategories.map(toItem)}
            income={incomeCategories.map(toItem)}
            transfer={transferCategories.map(toItem)}
          />
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}
