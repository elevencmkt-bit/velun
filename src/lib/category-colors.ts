import type { SupabaseClient } from "@supabase/supabase-js";

// Paleta categórica validada (dataviz skill / references/palette.md) —
// 8 matizes, ordem fixa, CVD-safe. Usada só nos gráficos de composição
// (donut do Mês); os --in/--out da direção visual continuam sendo a
// gramática de entrada/saída em todo o resto do app.
export const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export const MUTED_SLICE_COLOR = "#898781";

// Cor por categoria é fixa pela posição alfabética entre as categorias
// de despesa do household — nunca pelo tamanho do gasto no mês, para
// que a mesma categoria não troque de cor de um mês para o outro.
export function buildCategoryColorMap(expenseCategoryNames: string[]): Map<string, string> {
  const sorted = [...new Set(expenseCategoryNames)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const map = new Map<string, string>();
  sorted.forEach((name, i) => {
    if (i < CATEGORICAL_PALETTE.length) map.set(name, CATEGORICAL_PALETTE[i]);
  });
  return map;
}

// Busca as categorias de despesa do household e monta o mapa de cores —
// reaproveitado pela tela Mês (donut) e pelos badges de Transações/A pagar,
// para que a mesma categoria tenha sempre a mesma cor em todo o app.
export async function getExpenseCategoryColorMap(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("categories")
    .select("name")
    .eq("household_id", householdId)
    .eq("kind", "expense");

  return buildCategoryColorMap((data ?? []).map((c) => c.name));
}
