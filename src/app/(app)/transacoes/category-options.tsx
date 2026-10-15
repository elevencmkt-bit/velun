"use client";

import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import type { CategoryOption } from "./types";
import { fitsDirection } from "@/lib/category-kind";
import { orderWithChildren } from "@/lib/subcategories";
import { SubcategoryItem } from "@/components/category-select-items";

/**
 * Opções de categoria pra um seletor.
 *
 * Com `kind`, só as do tipo certo: saída escolhe entre despesas, entrada
 * entre receitas. Se o lançamento já estiver numa categoria do outro tipo
 * (`keepId`), ela continua na lista — senão o seletor ficaria em branco
 * e esconderia que tem algo marcado.
 *
 * Sem `kind` (seleção com entradas e saídas misturadas, ou filtro geral),
 * mostra as duas, separadas por título.
 *
 * Subcategorias vêm logo abaixo da principal, recuadas e ligadas a ela por um fio. No campo fechado
 * aparecem como "Transporte · Gasolina" (o prefixo some dentro da lista).
 */
function Item({ c, all }: { c: CategoryOption & { depth: 0 | 1 }; all: CategoryOption[] }) {
  if (c.depth === 0) {
    return <SelectItem value={c.id}>{c.name}</SelectItem>;
  }
  return <SubcategoryItem value={c.id} name={c.name} parentName={all.find((p) => p.id === c.parent_id)?.name} />;
}

export function CategoryOptions({
  categories,
  kind,
  keepId,
}: {
  categories: CategoryOption[];
  kind: "income" | "expense" | null;
  keepId?: string | null;
}) {
  if (kind) {
    const list = orderWithChildren(
      categories.filter((c) => fitsDirection(c, kind === "income" ? "in" : "out") || c.id === keepId),
    );
    return (
      <>
        {list.map((c) => (
          <Item key={c.id} c={c} all={categories} />
        ))}
      </>
    );
  }

  const groups: [string, CategoryOption[]][] = [
    ["Despesas", categories.filter((c) => c.kind === "expense" && !c.is_transfer)],
    ["Receitas", categories.filter((c) => c.kind === "income" && !c.is_transfer)],
    ["Entre contas", categories.filter((c) => c.is_transfer)],
  ];
  return (
    <>
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list]) => (
          <SelectGroup key={label}>
            <SelectLabel>{label}</SelectLabel>
            {orderWithChildren(list).map((c) => (
              <Item key={c.id} c={c} all={categories} />
            ))}
          </SelectGroup>
        ))}
    </>
  );
}
