"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function GlobalSearch() {
  const router = useRouter();

  return (
    <form
      className="relative w-80"
      onSubmit={(e) => {
        e.preventDefault();
        const value = (new FormData(e.currentTarget).get("q") as string) ?? "";
        router.push(`/transacoes?q=${encodeURIComponent(value)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--ink]/40" />
      <input
        name="q"
        placeholder="Buscar transações..."
        className="h-9 w-full rounded-lg border border-[--rule] bg-[--paper] pl-9 pr-3 text-sm outline-none focus:border-[--sidebar-active-bg]"
      />
    </form>
  );
}
