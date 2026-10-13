import { Landmark } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";

/**
 * Itens do filtro de conta: "Todas as contas" e cada conta com o ícone do
 * banco. O mesmo em todo filtro de conta (Dashboard, Relatórios,
 * Transações), pra lista ter a mesma cara em qualquer tela.
 */
export function AccountOptions({
  accounts,
  allValue,
}: {
  accounts: { id: string; name: string; type?: string | null; institution?: string | null }[];
  /** Valor do item "Todas as contas". */
  allValue: string;
}) {
  return (
    <>
      <SelectGroup>
        <SelectLabel>Mostrar</SelectLabel>
        <SelectItem value={allValue}>
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-(--bg-hover)">
            <Landmark className="h-3.5 w-3.5 text-(--text-secondary)" />
          </span>
          Todas as contas
        </SelectItem>
      </SelectGroup>
      {accounts.length > 0 ? <SelectSeparator /> : null}
      {accounts.map((a) => (
        <SelectItem key={a.id} value={a.id}>
          <AccountAvatar institution={a.institution ?? null} type={a.type ?? "checking"} size={26} />
          <span className="truncate">{a.name}</span>
        </SelectItem>
      ))}
    </>
  );
}
