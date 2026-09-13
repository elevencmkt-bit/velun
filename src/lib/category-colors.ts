import type { SupabaseClient } from "@supabase/supabase-js";

// Paleta de badges de categoria (UI Style Specs, seção 17) — fundo suave
// + texto saturado, a mesma cor saturada (`fg`) também alimenta o donut
// do Dashboard, então uma categoria tem sempre a mesma cor em todo o
// app, do badge ao gráfico.
export type CategoryColorPair = { bg: string; fg: string };

// Paleta curada para escolha manual (tela Configurações) e para o
// fallback automático — 14 opções, cada uma com fundo suave + texto
// saturado na mesma família de cor, para caber num grid de escolha.
export const CATEGORY_PALETTE: CategoryColorPair[] = [
  { bg: "#FFF0F3", fg: "#E62E64" }, // rosa
  { bg: "#FFF4E8", fg: "#C65D16" }, // laranja
  { bg: "#F4F3FF", fg: "#6941C6" }, // violeta
  { bg: "#EFF8FF", fg: "#175CD3" }, // azul
  { bg: "#F0FDF9", fg: "#0E7490" }, // teal
  { bg: "#FFFAEB", fg: "#B54708" }, // âmbar
  { bg: "#FDF2FA", fg: "#C11574" }, // fúcsia
  { bg: "#EEF2FF", fg: "#4338CA" }, // índigo
  { bg: "#ECFEFF", fg: "#0891B2" }, // ciano
  { bg: "#FEF2F2", fg: "#DC2626" }, // vermelho
  { bg: "#F7FEE7", fg: "#4D7C0F" }, // lima
  { bg: "#FBF3EC", fg: "#7C4A1E" }, // marrom
  { bg: "#F1F5F9", fg: "#334155" }, // cinza-azulado
  { bg: "#FAF5FF", fg: "#9333EA" }, // roxo
];

export const INCOME_COLOR: CategoryColorPair = { bg: "#ECFDF3", fg: "#027A48" };
export const MUTED_CATEGORY_COLOR: CategoryColorPair = { bg: "#F2F4F7", fg: "#475467" };

// Legado: usado só como fallback de fill sólido fora de badge/donut.
export const MUTED_SLICE_COLOR = MUTED_CATEGORY_COLOR.fg;

// Acha o par {bg,fg} da paleta cujo `fg` bate com o valor gravado em
// categories.color. Categorias criadas antes da escolha manual existir
// (ou nunca customizadas) têm um valor que não bate com nada aqui —
// nesse caso `undefined`, e a cor cai no fallback automático abaixo.
export function findPaletteColorByFg(fg: string | null | undefined): CategoryColorPair | undefined {
  if (!fg) return undefined;
  return CATEGORY_PALETTE.find((pair) => pair.fg.toLowerCase() === fg.toLowerCase());
}

// Cor por categoria: se a categoria tem uma cor manual escolhida (seu
// `color` bate com uma entrada da paleta), usa ela — vale tanto pra
// despesa quanto receita. Sem cor manual, cai no fallback automático:
// receita usa o verde fixo de INCOME_COLOR (identidade visual de
// "entrada"), despesa usa a posição alfabética entre as despesas sem
// cor manual, pra não trocar de cor de um mês pro outro.
export function buildCategoryColorMap(
  categories: { name: string; kind: "income" | "expense"; color: string | null }[],
): Map<string, CategoryColorPair> {
  const map = new Map<string, CategoryColorPair>();
  const autoExpenseNames: string[] = [];

  for (const category of categories) {
    const manual = findPaletteColorByFg(category.color);
    if (manual) {
      map.set(category.name, manual);
    } else if (category.kind === "income") {
      map.set(category.name, INCOME_COLOR);
    } else {
      autoExpenseNames.push(category.name);
    }
  }

  const sorted = [...new Set(autoExpenseNames)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sorted.forEach((name, i) => {
    map.set(name, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]);
  });

  return map;
}

// Busca todas as categorias do household (despesa e receita) e monta o
// mapa de cores — reaproveitado pela tela Mês (donut), Relatórios,
// Transações, A vencer e Configurações, pra que a mesma categoria
// tenha sempre a mesma cor em todo o app.
export async function getCategoryColorMap(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, CategoryColorPair>> {
  const { data } = await supabase
    .from("categories")
    .select("name, kind, color")
    .eq("household_id", householdId);

  return buildCategoryColorMap(data ?? []);
}
