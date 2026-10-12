"use client";

import { useState } from "react";
import { CategoryRow, type CategoryRowData } from "./category-row";
import { NewCategoryDialog } from "./new-category-dialog";

type Item = { category: CategoryRowData; color: string | null };

// Categorias em blocos, com abas Despesas/Receitas — cabe tudo em poucas
// linhas em vez de uma lista comprida.
export function CategoriesPanel({ expense, income }: { expense: Item[]; income: Item[] }) {
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const items = tab === "expense" ? expense : income;

  const tabClass = (on: boolean) =>
    `flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors sm:flex-none ${
      on ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.08)]" : "text-(--text-muted)"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-card-title">Categorias</h2>
          <p className="mt-1 text-sm text-(--text-muted) max-md:hidden">
            Passe o mouse numa categoria pra editar ou apagar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div role="tablist" className="flex flex-1 gap-1 rounded-xl bg-[#F4F5F8] p-1 sm:flex-none">
            <button type="button" role="tab" aria-selected={tab === "expense"} className={tabClass(tab === "expense")} onClick={() => setTab("expense")}>
              Despesas <span className="text-xs text-(--text-light)">{expense.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "income"} className={tabClass(tab === "income")} onClick={() => setTab("income")}>
              Receitas <span className="text-xs text-(--text-light)">{income.length}</span>
            </button>
          </div>
          <NewCategoryDialog />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-(--text-muted)">
          {tab === "expense" ? "Nenhuma categoria de despesa ainda." : "Nenhuma categoria de receita ainda."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(({ category, color }) => (
            <CategoryRow key={category.id} category={category} effectiveColor={color} />
          ))}
        </div>
      )}
    </div>
  );
}
