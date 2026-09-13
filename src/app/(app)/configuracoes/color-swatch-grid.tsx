"use client";

import { Check } from "lucide-react";
import { CATEGORY_PALETTE } from "@/lib/category-colors";

export function ColorSwatchGrid({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (fg: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-2">
        {CATEGORY_PALETTE.map((pair) => (
          <button
            key={pair.fg}
            type="button"
            aria-label={pair.fg}
            onClick={() => onChange(pair.fg)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-black/5 transition-transform hover:scale-110"
            style={{ backgroundColor: pair.fg }}
          >
            {value === pair.fg ? <Check className="h-3.5 w-3.5 text-white" /> : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="w-fit text-left text-xs text-(--text-muted) hover:text-(--text-primary)"
      >
        Usar cor automática
      </button>
    </div>
  );
}
