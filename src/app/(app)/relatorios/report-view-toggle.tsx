"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startNavProgress } from "@/components/nav-progress";

export type ReportView = "realizado" | "a-vencer";

export function ReportViewToggle({ view }: { view: ReportView }) {
  const router = useRouter();
  const navigate = (href: string) => {
    startNavProgress();
    router.push(href);
  };
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "realizado") params.delete("view");
    else params.set("view", next);
    navigate(`/relatorios?${params.toString()}`);
  }

  // Mesma altura e cara do seletor de mês ao lado: caixa branca com
  // sombra; a opção escolhida ganha o azul claro da marca.
  const item =
    "h-[38px] flex-none rounded-[12px] px-4 text-[14px] font-semibold text-(--text-muted) hover:text-(--text-secondary) data-active:bg-(--primary-soft)! data-active:text-(--primary)! data-active:shadow-none! data-active:border-transparent!";
  return (
    <Tabs value={view} onValueChange={onChange}>
      <TabsList className="h-12 gap-1 rounded-[16px] bg-(--bg-surface) p-[5px] shadow-(--shadow-card)">
        <TabsTrigger value="realizado" className={item}>
          Realizado
        </TabsTrigger>
        <TabsTrigger value="a-vencer" className={item}>
          A vencer
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
