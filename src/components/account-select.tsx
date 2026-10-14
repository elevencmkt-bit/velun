"use client";

import { AccountAvatar } from "@/components/account-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Account = { id: string; name: string; type?: string; institution?: string | null };

const TYPE_LABEL: Record<string, string> = {
  credit_card: "Cartão",
  investment: "Investimento",
  savings: "Poupança",
  cash: "Dinheiro",
};

/** Conta num menu: ocupa uma linha só, com o ícone do banco. */
export function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  exclude,
  label,
  placeholder = "Escolha a conta",
}: {
  id?: string;
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
  label: string;
  placeholder?: string;
}) {
  const options = accounts.filter((a) => a.id !== exclude);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className="h-12! w-full rounded-[12px] text-[15px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6} className="max-h-[min(360px,var(--radix-select-content-available-height))]">
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <AccountAvatar institution={a.institution ?? null} type={a.type ?? "checking"} size={24} />
            <span className="truncate">{a.name}</span>
            {a.type && TYPE_LABEL[a.type] ? (
              <span className="ml-1 text-[12px] text-(--text-muted)">{TYPE_LABEL[a.type]}</span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
