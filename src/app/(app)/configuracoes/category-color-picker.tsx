"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateCategoryColor } from "@/lib/actions/categories";
import { CATEGORY_PALETTE, findPaletteColorByFg } from "@/lib/category-colors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CategoryColorPicker({
  categoryId,
  color,
  effectiveColor,
}: {
  categoryId: string;
  color: string | null;
  effectiveColor: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const current = findPaletteColorByFg(color);

  function pick(fg: string | null) {
    startTransition(async () => {
      await updateCategoryColor(categoryId, fg);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label="Escolher cor da categoria"
          className="h-6 w-6 shrink-0 rounded-full border border-black/5 transition-transform hover:scale-110"
          style={{ backgroundColor: effectiveColor ?? "var(--text-light)" }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto p-2.5">
        <div className="grid grid-cols-7 gap-2">
          {CATEGORY_PALETTE.map((pair) => (
            <button
              key={pair.fg}
              type="button"
              aria-label={pair.fg}
              onClick={() => pick(pair.fg)}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-black/5 transition-transform hover:scale-110"
              style={{ backgroundColor: pair.fg }}
            >
              {(current?.fg ?? effectiveColor) === pair.fg ? (
                <Check className="h-3.5 w-3.5 text-white" />
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => pick(null)}
          className="mt-2 w-full text-left text-xs text-(--text-muted) hover:text-(--text-primary)"
        >
          Usar cor automática
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
