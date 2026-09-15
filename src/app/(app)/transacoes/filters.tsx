"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Landmark, Search, SlidersHorizontal, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AccountOption, CategoryOption, MemberOption } from "./types";

const ALL = "__all__";
const ADVANCED_KEYS = ["member", "origin", "direction", "from", "to"];

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

  function clearAdvanced() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ADVANCED_KEYS) params.delete(key);
    router.push(`/transacoes?${params.toString()}`);
  }

  const advancedCount = ADVANCED_KEYS.filter((key) => searchParams.get(key)).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
        <Input
          placeholder="Filtrar por descrição, categoria ou conta..."
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        defaultValue={searchParams.get("account") ?? ALL}
        onValueChange={(v) => setParam("account", v)}
      >
        <SelectTrigger className="w-44">
          <Landmark className="h-3.5 w-3.5 text-(--text-muted)" />
          <SelectValue placeholder="Todas as contas" />
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
        <SelectTrigger className="w-48">
          <Tag className="h-3.5 w-3.5 text-(--text-muted)" />
          <SelectValue placeholder="Todas as categorias" />
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

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="relative" aria-label="Mais filtros">
            <SlidersHorizontal className="h-4 w-4" />
            {advancedCount > 0 ? (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: "var(--primary)" }}
              >
                {advancedCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-(--text-primary)">Mais filtros</span>
            {advancedCount > 0 ? (
              <button
                type="button"
                onClick={clearAdvanced}
                className="text-xs font-medium text-(--primary) hover:underline"
              >
                Limpar
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--text-secondary)">Quem lançou</span>
            <Select
              defaultValue={searchParams.get("member") ?? ALL}
              onValueChange={(v) => setParam("member", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
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
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--text-secondary)">Origem</span>
            <Select
              defaultValue={searchParams.get("origin") ?? ALL}
              onValueChange={(v) => setParam("origin", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Manual e importado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Manual e importado</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="imported">Importado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--text-secondary)">Entradas x saídas</span>
            <Select
              defaultValue={searchParams.get("direction") ?? ALL}
              onValueChange={(v) => setParam("direction", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Entradas e saídas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Entradas e saídas</SelectItem>
                <SelectItem value="in">Só entradas</SelectItem>
                <SelectItem value="out">Só saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--text-secondary)">Período personalizado</span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                defaultValue={searchParams.get("from") ?? ""}
                onChange={(e) => setParam("from", e.target.value)}
              />
              <span className="text-xs text-(--text-muted)">até</span>
              <Input
                type="date"
                defaultValue={searchParams.get("to") ?? ""}
                onChange={(e) => setParam("to", e.target.value)}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
