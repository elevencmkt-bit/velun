"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Landmark } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

// Itens do menu no tamanho dos outros quadros (mês, período): mais altos,
// com respiro entre ícone e nome, e a conta escolhida em azul claro.
const ITEM =
  "my-0.5 min-h-12 gap-3 rounded-[12px] py-2 pr-11 pl-3 text-[15px] font-medium text-(--text-primary) cursor-pointer focus:bg-(--bg-hover) focus:text-(--text-primary) data-[state=checked]:bg-(--primary-soft) data-[state=checked]:font-semibold data-[state=checked]:text-(--primary) [&>span:first-child]:right-3.5 [&>span:first-child_svg]:size-[18px] *:[span]:last:gap-3";

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
        className={`h-12! max-w-[240px] gap-2 rounded-[16px] border-0 px-3.5 text-[14px] font-semibold shadow-(--shadow-card) ${
          value ? "bg-(--primary-soft) text-(--primary)" : "bg-(--bg-surface) text-(--text-primary)"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        sideOffset={8}
        className="max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[300px] rounded-[18px] border-(--border-soft) p-2 shadow-[0_18px_50px_rgba(16,24,40,.16)]"
      >
        <div className="px-3 pt-1.5 pb-2 text-[11px] font-bold tracking-[0.06em] text-(--text-light) uppercase">
          Mostrar
        </div>
        <SelectItem value={ALL} className={ITEM}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-(--bg-hover)">
            <Landmark className="h-4 w-4 text-(--text-secondary)" />
          </span>
          Todas as contas
        </SelectItem>
        {accounts.length > 0 ? <div className="mx-3 my-1.5 h-px bg-(--border-soft)" /> : null}
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id} className={ITEM}>
            <AccountAvatar institution={a.institution} type={a.type} size={28} />
            <span className="truncate">{a.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
