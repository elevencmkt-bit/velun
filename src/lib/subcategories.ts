// Subcategorias: Categoria › Sub, um nível só (regras no banco, 0030).
// Puro, pra usar no servidor e no navegador e testar sem banco.
//
// Princípio: em todo lugar que agrupa ou pinta por categoria (relatórios,
// Dashboard, cores, ícones), o NOME é o da categoria principal. A sub vem
// à parte, pra mostrar "Transporte · Gasolina" e abrir a divisão.

export type CategoryNode = {
  id: string;
  name: string;
  parent_id?: string | null;
};

/** O que vem do banco num join `category:categories(name, is_transfer, parent:parent_id(name, is_transfer))`. */
export type JoinedCategory = {
  name: string;
  is_transfer?: boolean | null;
  parent?: { name: string; is_transfer?: boolean | null } | { name: string; is_transfer?: boolean | null }[] | null;
};

/** Trecho de select pra trazer a categoria com a principal junto. */
export const CATEGORY_JOIN = "category:categories(name, is_transfer, parent:parent_id(name, is_transfer))";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Nome da principal, nome da sub (ou null) e se é movimentação entre contas. */
export function resolveJoinedCategory(raw: JoinedCategory | JoinedCategory[] | null | undefined): {
  name: string | null;
  sub: string | null;
  isTransfer: boolean;
} {
  const c = one(raw);
  if (!c) return { name: null, sub: null, isTransfer: false };
  const parent = one(c.parent);
  if (parent) return { name: parent.name, sub: c.name, isTransfer: Boolean(parent.is_transfer || c.is_transfer) };
  return { name: c.name, sub: null, isTransfer: Boolean(c.is_transfer) };
}

/** "Transporte · Gasolina", ou só "Transporte". */
export function categoryLabel(name: string | null, sub: string | null): string | null {
  if (!name) return null;
  return sub ? `${name} · ${sub}` : name;
}

/** Principais na ordem dada, cada uma seguida das suas subs (ordem dada também). */
export function orderWithChildren<T extends CategoryNode>(list: T[]): (T & { depth: 0 | 1 })[] {
  const ids = new Set(list.map((c) => c.id));
  const children = new Map<string, T[]>();
  for (const c of list) {
    if (c.parent_id && ids.has(c.parent_id)) {
      const arr = children.get(c.parent_id) ?? [];
      arr.push(c);
      children.set(c.parent_id, arr);
    }
  }
  const out: (T & { depth: 0 | 1 })[] = [];
  for (const c of list) {
    // Sub cuja principal não está na lista (filtrada por tipo, arquivada)
    // aparece como principal, pra não sumir.
    if (c.parent_id && ids.has(c.parent_id)) continue;
    out.push({ ...c, depth: 0 });
    for (const s of children.get(c.id) ?? []) out.push({ ...s, depth: 1 });
  }
  return out;
}

/** A categoria e as subs dela (pra filtrar "Transporte" pegando "Transporte · Gasolina"). */
export function familyIds(list: CategoryNode[], id: string): string[] {
  return [id, ...list.filter((c) => c.parent_id === id).map((c) => c.id)];
}

export function childrenOf<T extends CategoryNode>(list: T[], id: string): T[] {
  return list.filter((c) => c.parent_id === id);
}

/** A principal de uma categoria (ela mesma, se já for principal). */
export function topOf<T extends CategoryNode>(list: T[], id: string | null | undefined): T | null {
  if (!id) return null;
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  if (c.parent_id) return list.find((x) => x.id === c.parent_id) ?? c;
  return c;
}
