import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { classifyClaims } from "@/lib/auth-check";
import { helpSearchIndex } from "@/lib/help/content";
import { HelpSearch } from "@/components/help/help-search";

export const metadata: Metadata = {
  title: { default: "Central de ajuda · Velun", template: "%s · Ajuda Velun" },
  description: "Guias curtos de cada parte do Velun, do primeiro lançamento à privacidade do casal.",
};

// Central de ajuda: aberta com ou sem login (quem ainda não é cliente
// também lê). Quem está logado volta pro app; quem não está, entra.
export default async function AjudaLayout({ children }: { children: React.ReactNode }) {
  let loggedIn = false;
  try {
    const supabase = await createClient();
    loggedIn = classifyClaims(await supabase.auth.getClaims()).status === "ok";
  } catch {
    loggedIn = false;
  }
  const index = helpSearchIndex();

  return (
    <div className="min-h-dvh bg-(--bg-app) text-(--text-primary)">
      <header className="sticky top-0 z-20 border-b border-(--border-soft) bg-(--bg-surface)">
        <div className="mx-auto flex min-h-[68px] max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-8">
          <Link href="/ajuda" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/velun-icon.png" alt="" className="h-8 w-8 rounded-[10px]" />
            <span className="text-[18px] font-bold tracking-[-0.02em]">velun</span>
            <span className="border-l border-(--border-primary) pl-2.5 text-[14px] font-medium text-(--text-muted)">Ajuda</span>
          </Link>
          <div className="flex items-center gap-3 max-sm:order-last max-sm:w-full sm:order-none">
            <HelpSearch index={index} variant="compact" />
          </div>
          <Link
            href={loggedIn ? "/mes" : "/login"}
            className="flex h-10 items-center rounded-[12px] bg-(--primary-soft) px-4 text-[14px] font-semibold text-(--primary) hover:bg-(--primary-light)"
          >
            {loggedIn ? "Voltar pro app" : "Entrar"}
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
