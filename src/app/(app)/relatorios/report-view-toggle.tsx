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
      <TabsList>
        <TabsTrigger value="realizado">Realizado</TabsTrigger>
        <TabsTrigger value="a-vencer">A vencer</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
