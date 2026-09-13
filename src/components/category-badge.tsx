import { MUTED_SLICE_COLOR } from "@/lib/category-colors";

// Pills coloridos por categoria, no espírito do mockup — mas a cor é
// sempre um "dot" ao lado do texto (nunca a cor do próprio texto), por
// acessibilidade: texto usa token de ink, cor carrega identidade.
export function CategoryBadge({
  name,
  kind,
  color,
}: {
  name: string;
  kind: "income" | "expense" | null;
  color?: string;
}) {
  if (!name) {
    return <span className="text-xs text-[--ink]/50">Sem categoria</span>;
  }

  const dot = kind === "income" ? "var(--badge-green-fg)" : (color ?? MUTED_SLICE_COLOR);
  const bg = kind === "income" ? "var(--badge-green-bg)" : `color-mix(in srgb, ${dot} 16%, white)`;

  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-[--ink]"
      style={{ backgroundColor: bg }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      {name}
    </span>
  );
}
