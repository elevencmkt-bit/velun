"use client";

import { SelectItem } from "@/components/ui/select";
import { orderWithChildren } from "@/lib/subcategories";

type Cat = { id: string; name: string; parent_id?: string | null };

/**
 * Itens de categoria pra um <Select>: cada principal seguida das subs,
 * recuadas. No campo fechado a sub aparece como "Transporte · Gasolina"
 * (o prefixo some dentro da lista aberta).
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
          <SelectItem key={c.id} value={c.id} className="pl-8">
            <span className="in-data-[slot=select-content]:hidden">
              {categories.find((p) => p.id === c.parent_id)?.name} ·{" "}
            </span>
            {c.name}
          </SelectItem>
        ),
      )}
    </>
  );
}
