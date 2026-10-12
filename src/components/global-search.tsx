"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function GlobalSearch() {
  const router = useRouter();

  return (
    <form
      className="relative w-full max-w-[400px]"
      onSubmit={(e) => {
        e.preventDefault();
        const value = (new FormData(e.currentTarget).get("q") as string) ?? "";
        router.push(`/transacoes?q=${encodeURIComponent(value)}`);
      }}
    >
      <Search
        size={16}
        strokeWidth={1.8}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-(--text-light)"
      />
      <input
        name="q"
        placeholder="Buscar transações..."
        className="h-11 w-full rounded-[14px] border border-transparent bg-white pl-10 pr-3 text-[13px] text-(--text-secondary) outline-none transition-colors placeholder:text-(--text-light) focus:bg-white focus:[border-color:#A4A8FF] focus:[box-shadow:0_0_0_3px_rgba(81,88,246,.10)]"
      />
    </form>
  );
}
