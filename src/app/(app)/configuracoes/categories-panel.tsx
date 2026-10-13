"use client";

import { useState } from "react";
import { CategoryRow, type CategoryRowData } from "./category-row";
import { NewCategoryDialog } from "./new-category-dialog";

type Item = { category: CategoryRowData; color: string | null };

// Categorias em blocos, com abas Despesas/Receitas — cabe tudo em poucas
// linhas em vez de uma lista comprida.
export function CategoriesPanel({
  expense,
  income,
  transfer = [],
}: {
  expense: Item[];
  income: Item[];
  /** Movimentação entre contas: fora de receita e despesa. */
  transfer?: Item[];
}) {
  const [tab, setTab] = useState<"expense" | "income" | "transfer">("expense");
  const items = tab === "expense" ? expense : tab === "income" ? income : transfer;
  // Subcategorias aparecem embaixo da principal; uma sub cuja principal
  // não está nesta aba aparece como principal, pra não sumir.
  const ids = new Set(items.map((i) => i.category.id));
  const tops = items.filter((i) => !i.category.parent_id || !ids.has(i.category.parent_id));
  // Onde uma categoria pode entrar como sub: principais desta aba (fora
  // "Entre contas", que não tem sub).
  const eligibleParents =
    tab === "transfer" ? [] : tops.filter((i) => !i.category.parent_id).map((i) => ({ id: i.category.id, name: i.category.name }));

  const tabClass = (on: boolean) =>
    `flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors sm:flex-none ${
      on ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.08)]" : "text-(--text-muted)"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {/* No celular: título e "Nova categoria" na mesma linha, abas embaixo. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">Categorias</h2>
          <p className="mt-1 text-sm text-(--text-muted) max-md:hidden">
            Passe o mouse numa categoria pra editar ou apagar. Pra criar uma subcategoria, edite a categoria.
          </p>
        </div>
        <div role="tablist" className="order-3 flex w-full gap-1 rounded-xl bg-(--bg-track) p-1 sm:order-2 sm:w-auto">
          <button type="button" role="tab" aria-selected={tab === "expense"} className={tabClass(tab === "expense")} onClick={() => setTab("expense")}>
            Despesas <span className="text-xs text-(--text-light)">{expense.filter((i) => !i.category.parent_id).length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "income"} className={tabClass(tab === "income")} onClick={() => setTab("income")}>
            Receitas <span className="text-xs text-(--text-light)">{income.filter((i) => !i.category.parent_id).length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "transfer"} className={tabClass(tab === "transfer")} onClick={() => setTab("transfer")}>
            Entre contas <span className="text-xs text-(--text-light)">{transfer.length}</span>
          </button>
        </div>
        <div className="order-2 sm:order-3">
          <NewCategoryDialog />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-(--text-muted)">
          {tab === "expense"
            ? "Nenhuma categoria de despesa ainda."
            : tab === "income"
              ? "Nenhuma categoria de receita ainda."
              : "Nenhuma ainda. Crie uma (ex.: Transferência) em \"Nova categoria\" › Entre contas, pra dinheiro que só muda de conta — não conta como receita nem despesa."}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 md:gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
          {tops.map(({ category, color }) => {
            const subs = items.filter((i) => i.category.parent_id === category.id);
            return (
              <div key={category.id} className="flex min-w-0 flex-col gap-1.5">
                <CategoryRow
                  category={category}
                  effectiveColor={color}
                  parents={eligibleParents}
                  childCount={subs.length}
                />
                {subs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pl-3">
                    {subs.map((sub) => (
                      <CategoryRow
                        key={sub.category.id}
                        category={sub.category}
                        effectiveColor={color}
                        parents={eligibleParents}
                        compact
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
