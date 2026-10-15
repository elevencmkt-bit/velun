"use client";

import { SelectItem } from "@/components/ui/select";
import { orderWithChildren } from "@/lib/subcategories";

type Cat = { id: string; name: string; parent_id?: string | null };

/**
 * Subcategoria num <Select>: recuada, com um fio à esquerda que liga as
 * subs à principal logo acima, em letra mais leve. No campo fechado
 * aparece como "Trabalho · Assinaturas" (o prefixo e o fio só existem
 * fora/dentro da lista aberta, respectivamente).
 */
export function SubcategoryItem({ value, name, parentName }: { value: string; name: string; parentName?: string | null }) {
  return (
    <SelectItem value={value} className="min-h-10 pl-10 text-[13.5px] font-normal text-(--text-body)">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 left-[21px] hidden w-0.5 bg-(--border-strong) in-data-[slot=select-content]:block"
      />
      {parentName ? <span className="in-data-[slot=select-content]:hidden">{parentName} · </span> : null}
      {name}
    </SelectItem>
  );
}

/**
 * Itens de categoria pra um <Select>: cada principal seguida das subs.
 */
export function CategorySelectItems({ categories }: { categories: Cat[] }) {
  return (
    <>
      {orderWithChildren(categories).map((c) =>
        c.depth === 0 ? (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ) : (
          <SubcategoryItem
            key={c.id}
            value={c.id}
            name={c.name}
            parentName={categories.find((p) => p.id === c.parent_id)?.name}
          />
        ),
      )}
    </>
  );
}
