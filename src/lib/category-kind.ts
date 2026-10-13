// Que categorias servem pra um lançamento: despesa pra saída, receita pra
// entrada — e a de movimentação entre contas pros dois lados.
export function fitsDirection(
  category: { kind: "income" | "expense" | string; is_transfer?: boolean | null },
  direction: "in" | "out",
): boolean {
  if (category.is_transfer) return true;
  return category.kind === (direction === "in" ? "income" : "expense");
}
