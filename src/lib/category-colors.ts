import type { SupabaseClient } from "@supabase/supabase-js";

// Paleta de badges de categoria (UI Style Specs, seção 17) — fundo suave
// + texto saturado, a mesma cor saturada (`fg`) também alimenta o donut
// do Dashboard, então uma categoria tem sempre a mesma cor em todo o
// app, do badge ao gráfico.
export type CategoryColorPair = { bg: string; fg: string };

export const CATEGORY_PALETTE: CategoryColorPair[] = [
  { bg: "#FFF0F3", fg: "#E62E64" }, // rosa — Alimentação
  { bg: "#FFF4E8", fg: "#C65D16" }, // laranja — Moradia
  { bg: "#F4F3FF", fg: "#6941C6" }, // violeta — Assinaturas
  { bg: "#EFF8FF", fg: "#175CD3" }, // azul — Transporte
  { bg: "#F0FDF9", fg: "#0E7490" }, // teal
  { bg: "#FFFAEB", fg: "#B54708" }, // âmbar
  { bg: "#FDF2FA", fg: "#C11574" }, // fúcsia
];

export const INCOME_COLOR: CategoryColorPair = { bg: "#ECFDF3", fg: "#027A48" };
export const MUTED_CATEGORY_COLOR: CategoryColorPair = { bg: "#F2F4F7", fg: "#475467" };

// Legado: usado só como fallback de fill sólido fora de badge/donut.
export const MUTED_SLICE_COLOR = MUTED_CATEGORY_COLOR.fg;

// Cor por categoria é fixa pela posição alfabética entre as categorias
// de despesa do household — nunca pelo tamanho do gasto no mês, para
// que a mesma categoria não troque de cor de um mês para o outro.
export function buildCategoryColorMap(expenseCategoryNames: string[]): Map<string, CategoryColorPair> {
  const sorted = [...new Set(expenseCategoryNames)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const map = new Map<string, CategoryColorPair>();
  sorted.forEach((name, i) => {
    map.set(name, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]);
  });
  return map;
}

// Busca as categorias de despesa do household e monta o mapa de cores —
// reaproveitado pela tela Mês (donut) e pelos badges de Transações/A vencer,
// para que a mesma categoria tenha sempre a mesma cor em todo o app.
export async function getExpenseCategoryColorMap(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, CategoryColorPair>> {
  const { data } = await supabase
    .from("categories")
    .select("name")
    .eq("household_id", householdId)
    .eq("kind", "expense");

  return buildCategoryColorMap((data ?? []).map((c) => c.name));
}
