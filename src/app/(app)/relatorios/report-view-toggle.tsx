"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ReportView = "realizado" | "a-vencer";

export function ReportViewToggle({ view }: { view: ReportView }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "realizado") params.delete("view");
    else params.set("view", next);
    router.push(`/relatorios?${params.toString()}`);
  }

  return (
    <Tabs value={view} onValueChange={onChange}>
      <TabsList className="h-10 rounded-full border border-(--border-primary) bg-(--bg-subtle) p-1">
        <TabsTrigger
          value="realizado"
          className="rounded-full px-3.5 text-(--text-secondary) data-active:bg-primary data-active:text-primary-foreground data-active:shadow-[0_2px_5px_rgba(81,88,246,.20)]"
        >
          Realizado
        </TabsTrigger>
        <TabsTrigger
          value="a-vencer"
          className="rounded-full px-3.5 text-(--text-secondary) data-active:bg-primary data-active:text-primary-foreground data-active:shadow-[0_2px_5px_rgba(81,88,246,.20)]"
        >
          A vencer
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
