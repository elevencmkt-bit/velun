"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountOptions } from "@/components/account-options";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";


// Filtro de conta do Dashboard: os totais, o saldo e as listas passam a
// ser de uma conta só. Fica na URL (?account=), junto com o mês.
export function AccountFilter({
  accounts,
  value,
}: {
  accounts: { id: string; name: string; type: string; institution: string | null }[];
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL) params.delete("account");
    else params.set("account", next);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <Select value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Conta"
        className={`h-12! w-fit max-w-[240px] gap-2 rounded-[16px] border-0 px-3.5 text-[14px] font-semibold shadow-(--shadow-card) ${
          value ? "bg-(--primary-soft) text-(--primary)" : "bg-(--bg-surface) text-(--text-primary)"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        sideOffset={8}
        className="max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[280px]"
      >
        <AccountOptions accounts={accounts} allValue={ALL} />
      </SelectContent>
    </Select>
  );
}
