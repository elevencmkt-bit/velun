"use client";

import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import type { CategoryOption } from "./types";

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
 */
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
    const list = categories.filter((c) => c.kind === kind || c.id === keepId);
    return (
      <>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </>
    );
  }

  const groups: [string, CategoryOption[]][] = [
    ["Despesas", categories.filter((c) => c.kind === "expense")],
    ["Receitas", categories.filter((c) => c.kind === "income")],
  ];
  return (
    <>
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([label, list]) => (
          <SelectGroup key={label}>
            <SelectLabel>{label}</SelectLabel>
            {list.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
    </>
  );
}
