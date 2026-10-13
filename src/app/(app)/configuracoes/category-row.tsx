"use client";

import { createElement, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  setCategoryParent,
  updateCategoryColor,
  updateCategoryIcon,
  updateCategoryName,
} from "@/lib/actions/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { findPaletteColorByFg } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { ColorSwatchGrid } from "./color-swatch-grid";
import { IconSwatchGrid } from "./icon-swatch-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { themedFg } from "@/lib/theme-color";

export type CategoryRowData = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
  icon: string | null;
  /** Preenchido quando é subcategoria. */
  parent_id?: string | null;
};

const NO_PARENT = "__principal__";

export function CategoryRow({
  category,
  effectiveColor,
  parents = [],
  childCount = 0,
  compact = false,
}: {
  category: CategoryRowData;
  effectiveColor?: string | null;
  /** Categorias principais do mesmo tipo onde esta pode entrar como sub. */
  parents?: { id: string; name: string }[];
  /** Quantas subs ela tem (quem tem sub não vira sub). */
  childCount?: number;
  /** Sub: bloco menor, embaixo da principal. */
  compact?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<string | null>(findPaletteColorByFg(category.color)?.fg ?? null);
  const [icon, setIcon] = useState<string | null>(category.icon);
  const [parentId, setParentId] = useState<string>(category.parent_id ?? NO_PARENT);
  const [newSub, setNewSub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const RowIcon = useMemo(
    () => getCategoryIcon(category.name, category.kind === "income" ? "in" : "out", category.icon),
    [category.name, category.kind, category.icon],
  );

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateCategoryName(category.id, name);
        await updateCategoryColor(category.id, color);
        await updateCategoryIcon(category.id, icon);
        const nextParent = parentId === NO_PARENT ? null : parentId;
        if (nextParent !== (category.parent_id ?? null)) await setCategoryParent(category.id, nextParent);
        if (newSub.trim()) {
          const fd = new FormData();
          fd.set("name", newSub.trim());
          fd.set("kind", category.kind);
          fd.set("parent_id", category.id);
          await createCategory(fd);
          setNewSub("");
        }
        setEditOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar categoria.");
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      await deleteCategory(category.id);
      router.refresh();
    });
  }

  const tint = effectiveColor ? themedFg(effectiveColor) : "var(--text-light)";

  // Bloco da categoria. No computador, editar e apagar aparecem ao passar
  // o mouse; no celular, um toque abre a edição, que também tem o excluir.
  return (
    <div
      className={`group relative flex min-w-0 items-center gap-2 pr-1.5 pl-1.5 transition-colors md:gap-2.5 ${
        compact
          ? "h-9 rounded-full border border-(--border-soft) bg-(--bg-surface) pl-3 hover:bg-(--bg-hover)"
          : "h-12 rounded-[14px] bg-(--bg-subtle) hover:bg-(--bg-hover)"
      }`}
    >
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none md:gap-2.5"
        aria-label={`Editar ${category.name}`}
      >
        {compact ? null : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] md:h-9 md:w-9 md:rounded-[11px]"
            style={{ backgroundColor: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}
          >
            {createElement(RowIcon, { className: "h-[17px] w-[17px]" })}
          </span>
        )}
        <span
          className={`truncate font-semibold text-(--text-primary) ${compact ? "text-[13px] font-medium" : "text-[13px] md:text-[14px]"}`}
        >
          {category.name}
        </span>
      </button>

      <span className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <Dialog
          open={editOpen}
          onOpenChange={(next) => {
            setEditOpen(next);
            if (!next) setError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Editar categoria" className="max-md:hidden">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{category.parent_id ? "Editar subcategoria" : "Editar categoria"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-category-name">Nome</Label>
                <Input
                  id="edit-category-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Dentro de</Label>
                <Select value={parentId} onValueChange={setParentId} disabled={childCount > 0}>
                  <SelectTrigger aria-label="Dentro de qual categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>Nenhuma — é uma categoria principal</SelectItem>
                    {parents
                      .filter((p) => p.id !== category.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-(--text-muted)">
                  {childCount > 0
                    ? `Tem ${childCount} ${childCount === 1 ? "subcategoria" : "subcategorias"}, então fica como principal.`
                    : "Virando sub, os lançamentos vão junto e passam a somar na principal nos relatórios."}
                </p>
              </div>
              {parentId === NO_PARENT ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-sub">Nova subcategoria (opcional)</Label>
                    <Input
                      id="new-sub"
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      placeholder={`Ex.: dentro de ${name || "Transporte"}`}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Cor</Label>
                    <ColorSwatchGrid value={color} onChange={setColor} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Ícone</Label>
                    <IconSwatchGrid value={icon} onChange={setIcon} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-(--text-muted)">Sub usa a cor e o ícone da categoria principal.</p>
              )}
              {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
              <Button type="submit" size="form" disabled={isPending} className="mt-1 w-full">
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-[12px] text-[14px] text-(--expense-dark) hover:bg-(--expense-soft) hover:text-(--expense-dark)"
                onClick={() => {
                  setEditOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Excluir categoria
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Excluir categoria" className="max-md:hidden">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir categoria &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                {category.parent_id
                  ? "Os lançamentos dessa subcategoria voltam pra categoria principal. Essa ação não pode ser desfeita."
                  : childCount > 0
                    ? "Lançamentos que usam essa categoria ficam sem categoria, e as subcategorias dela viram categorias principais. Essa ação não pode ser desfeita."
                    : "Lançamentos que usam essa categoria passam a ficar sem categoria. Essa ação não pode ser desfeita."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPending}
                onClick={onDelete}
                className="bg-(--expense) hover:bg-(--expense-dark)"
              >
                {isPending ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </span>
    </div>
  );
}
