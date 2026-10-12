"use client";

import { createElement, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteCategory,
  updateCategoryColor,
  updateCategoryIcon,
  updateCategoryName,
} from "@/lib/actions/categories";
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

export type CategoryRowData = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
  icon: string | null;
};

export function CategoryRow({
  category,
  effectiveColor,
}: {
  category: CategoryRowData;
  effectiveColor?: string | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<string | null>(findPaletteColorByFg(category.color)?.fg ?? null);
  const [icon, setIcon] = useState<string | null>(category.icon);
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

  const tint = effectiveColor ?? "var(--text-light)";

  // Bloco da categoria. No computador, editar e apagar aparecem ao passar
  // o mouse; no celular (sem mouse) ficam sempre à mostra, discretos.
  return (
    <div className="group relative flex h-12 min-w-0 items-center gap-2.5 rounded-[14px] bg-[#F7F8FA] pr-1.5 pl-1.5 transition-colors hover:bg-[#F0F2F6]">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
        aria-label={`Editar ${category.name}`}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={{ backgroundColor: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}
        >
          {createElement(RowIcon, { className: "h-[17px] w-[17px]" })}
        </span>
        <span className="truncate text-[14px] font-semibold text-(--text-primary)">{category.name}</span>
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
              <DialogTitle>Editar categoria</DialogTitle>
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
                <Label>Cor</Label>
                <ColorSwatchGrid value={color} onChange={setColor} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Ícone</Label>
                <IconSwatchGrid value={icon} onChange={setIcon} />
              </div>
              {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Excluir categoria" className="text-(--text-light)">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir categoria &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                Lançamentos que usam essa categoria passam a ficar sem categoria. Essa ação não pode
                ser desfeita.
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
