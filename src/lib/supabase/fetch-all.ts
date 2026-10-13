// O Supabase devolve no máximo 1000 linhas por consulta. Extrato de anos
// passa disso fácil, e cortar em silêncio é o pior erro possível aqui
// (duplicata que passa, revisão que mostra só parte). Esta função busca
// em páginas até acabar. A consulta precisa ter ordem estável.

const PAGE = 1000;

export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}
