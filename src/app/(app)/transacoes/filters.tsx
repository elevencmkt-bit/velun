"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountOption, CategoryOption, MemberOption } from "./types";

const ALL = "__all__";

export function TransactionFilters({
  accounts,
  categories,
  members,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) params.delete(key);
    else params.set(key, value);
    router.push(`/transacoes?${params.toString()}`);
  }

  function onSearchChange(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setParam("q", value), 300);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Buscar descrição..."
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-56"
      />

      <Select
        defaultValue={searchParams.get("account") ?? ALL}
        onValueChange={(v) => setParam("account", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as contas</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={searchParams.get("category") ?? ALL}
        onValueChange={(v) => setParam("category", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as categorias</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={searchParams.get("member") ?? ALL}
        onValueChange={(v) => setParam("member", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Quem lançou" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={searchParams.get("origin") ?? ALL}
        onValueChange={(v) => setParam("origin", v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Manual e importado</SelectItem>
          <SelectItem value="manual">Manual</SelectItem>
          <SelectItem value="imported">Importado</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        defaultValue={searchParams.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value)}
        className="w-36"
      />
      <span className="text-sm text-(--ink)/50">até</span>
      <Input
        type="date"
        defaultValue={searchParams.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value)}
        className="w-36"
      />
    </div>
  );
}
