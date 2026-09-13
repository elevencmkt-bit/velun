import { INCOME_COLOR, MUTED_CATEGORY_COLOR, type CategoryColorPair } from "@/lib/category-colors";

// Pills de categoria (UI Style Specs, seção 17): fundo suave, texto
// saturado, sem parecer botão — nada de dot ou borda.
export function CategoryBadge({
  name,
  kind,
  color,
}: {
  name: string;
  kind: "income" | "expense" | null;
  color?: CategoryColorPair;
}) {
  if (!name) {
    return <span className="text-xs text-(--text-light)">Sem categoria</span>;
  }

  const pair = kind === "income" ? INCOME_COLOR : (color ?? MUTED_CATEGORY_COLOR);

  return (
    <span
      className="inline-flex h-[26px] w-fit items-center rounded-[6px] px-2 text-[11px] font-medium"
      style={{ backgroundColor: pair.bg, color: pair.fg }}
    >
      {name}
    </span>
  );
}
