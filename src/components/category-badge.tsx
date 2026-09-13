import { MUTED_CATEGORY_COLOR, type CategoryColorPair } from "@/lib/category-colors";

// Pills de categoria (UI Style Specs, seção 17): fundo suave, texto
// saturado, sem parecer botão — nada de dot ou borda. A cor já vem
// resolvida do mapa de cores do household (manual ou automática, tanto
// pra despesa quanto receita), então o componente só desenha.
export function CategoryBadge({
  name,
  color,
}: {
  name: string;
  color?: CategoryColorPair;
}) {
  if (!name) {
    return <span className="text-xs text-(--text-light)">Sem categoria</span>;
  }

  const pair = color ?? MUTED_CATEGORY_COLOR;

  return (
    <span
      className="inline-flex h-[26px] w-fit items-center rounded-[6px] px-2 text-[11px] font-medium"
      style={{ backgroundColor: pair.bg, color: pair.fg }}
    >
      {name}
    </span>
  );
}
