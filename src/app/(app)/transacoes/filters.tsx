"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Search, SlidersHorizontal, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AccountOptions } from "@/components/account-options";
import type { AccountOption, CategoryOption, MemberOption } from "./types";
import { CategoryOptions } from "./category-options";
import { DateInput } from "@/components/date-input";

const ALL = "__all__";
const ADVANCED_KEYS = ["member", "origin", "direction", "from", "to", "all"];

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
    // De/até é outro tipo de período: tira o "todo o período".
    if (key === "from" || key === "to") params.delete("all");
    router.push(`/transacoes?${params.toString()}`);
  }

  // "Todo o período" liga/desliga; ligado, tira mês e de/até.
  function toggleAllPeriod() {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("all") === "1") {
      params.delete("all");
    } else {
      for (const key of ["month", "from", "to"]) params.delete(key);
      params.set("all", "1");
    }
    router.push(`/transacoes?${params.toString()}`);
  }
  const allPeriod = searchParams.get("all") === "1";

  function onSearchChange(value: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setParam("q", value), 300);
  }

  function clearAdvanced() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ADVANCED_KEYS) params.delete(key);
    router.push(`/transacoes?${params.toString()}`);
  }

  // Filtro de direção ligado: só as categorias daquele tipo.
  const direction = searchParams.get("direction");
  const filterKind =
    direction === "in" ? ("income" as const) : direction === "out" ? ("expense" as const) : null;

  const advancedCount = ADVANCED_KEYS.filter((key) =>
    searchParams.get(key),
  ).length;

  // Conta e categoria ficam à vista no computador; no celular entram no
  // botão "Filtros", junto com o resto, pra lista aparecer logo.
  const mobileCount = ["account", "category"].filter((key) => searchParams.get(key)).length;

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1 2xl:w-[220px] 2xl:flex-none">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
        <Input
          placeholder="Buscar…"
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 rounded-[10px] pl-9 text-[14px]"
        />
      </div>
      <div className="flex items-center gap-2 max-md:hidden">
        <Select
          defaultValue={searchParams.get("account") ?? ALL}
          onValueChange={(v) => setParam("account", v)}
        >
          <SelectTrigger className="w-52 h-10! rounded-[10px] pl-2 text-[14px]">
            <SelectValue placeholder="Todas as contas" />
          </SelectTrigger>
          <SelectContent>
            <AccountOptions accounts={accounts} allValue={ALL} />
          </SelectContent>
        </Select>

        <Select
          defaultValue={searchParams.get("category") ?? ALL}
          onValueChange={(v) => setParam("category", v)}
        >
          <SelectTrigger className="w-52 h-10! rounded-[10px] text-[14px]">
            <Tag className="h-3.5 w-3.5 text-(--text-muted) " />
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            <SelectItem value="none">Sem categoria</SelectItem>
            <CategoryOptions categories={categories} kind={filterKind} keepId={searchParams.get("category")} />
          </SelectContent>
        </Select>

      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="relative h-10 shrink-0 gap-1.5 px-3.5 md:w-10 md:px-0"
            aria-label="Mais filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="md:hidden">Filtros</span>
            {advancedCount + mobileCount > 0 ? (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: "var(--primary)" }}
              >
                {advancedCount + mobileCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-(--text-primary)">
              <span className="md:hidden">Filtros</span>
              <span className="max-md:hidden">Mais filtros</span>
            </span>
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

          {/* No celular, conta e categoria moram aqui dentro. */}
          <div className="flex flex-col gap-2.5 md:hidden">
          <Select
            defaultValue={searchParams.get("account") ?? ALL}
            onValueChange={(v) => setParam("account", v)}
          >
            <SelectTrigger className="w-full pl-2.5">
              <SelectValue placeholder="Todas as contas" />
            </SelectTrigger>
            <SelectContent>
              <AccountOptions accounts={accounts} allValue={ALL} />
            </SelectContent>
          </Select>

          <Select
            defaultValue={searchParams.get("category") ?? ALL}
            onValueChange={(v) => setParam("category", v)}
          >
            <SelectTrigger className="w-full">
              <Tag className="h-3.5 w-3.5 text-(--text-muted)" />
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              <SelectItem value="none">Sem categoria</SelectItem>
              <CategoryOptions categories={categories} kind={filterKind} keepId={searchParams.get("category")} />
            </SelectContent>
          </Select>

          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-(--text-secondary)">
              Quem lançou
            </span>
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
            <span className="text-xs font-medium text-(--text-secondary)">
              Origem
            </span>
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
            <span className="text-xs font-medium text-(--text-secondary)">
              Entradas x saídas
            </span>
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
            <span className="text-xs font-medium text-(--text-secondary)">
              Período
            </span>
            <button
              type="button"
              onClick={toggleAllPeriod}
              aria-pressed={allPeriod}
              className={`flex h-10 items-center justify-center rounded-[10px] border text-[13px] font-semibold transition-colors ${
                allPeriod
                  ? "border-(--primary) bg-(--primary-soft) text-(--primary)"
                  : "border-input bg-(--bg-surface) text-(--text-secondary) hover:border-(--primary) hover:text-(--primary)"
              }`}
            >
              Todo o período
            </button>
            <span className="mt-1 text-xs text-(--text-muted)">ou de / até</span>
            <div className="flex items-center gap-2">
              <DateInput
                key={`from-${allPeriod}`}
                aria-label="De"
                defaultValue={searchParams.get("from") ?? ""}
                onChange={(v) => setParam("from", v)}
              />
              <span className="text-xs text-(--text-muted)">até</span>
              <DateInput
                key={`to-${allPeriod}`}
                aria-label="Até"
                defaultValue={searchParams.get("to") ?? ""}
                onChange={(v) => setParam("to", v)}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
