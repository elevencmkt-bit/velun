"use client";

import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";

export function IconSwatchGrid({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-2">
        {CATEGORY_ICON_OPTIONS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onChange(key)}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={
              value === key
                ? { borderColor: "var(--primary)", background: "var(--primary-light)", color: "var(--primary)" }
                : { borderColor: "var(--border-primary)", color: "var(--text-secondary)" }
            }
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="w-fit text-left text-xs text-(--text-muted) hover:text-(--text-primary)"
      >
        Usar ícone automático
      </button>
    </div>
  );
}
