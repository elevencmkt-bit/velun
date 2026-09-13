"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteCategory, updateCategoryName } from "@/lib/actions/categories";
import { CategoryColorPicker } from "./category-color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onSaveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateCategoryName(category.id, name);
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

  return (
    <div className="flex min-h-[50px] items-center gap-3 border-b border-(--border-soft) px-1 last:border-0">
      {category.kind === "expense" ? (
        <CategoryColorPicker
          categoryId={category.id}
          color={category.color}
          effectiveColor={effectiveColor ?? null}
        />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: "var(--income)" }} />
      )}
      <span className="text-table-body text-(--text-primary)">{category.name}</span>

      <span className="ml-auto flex items-center gap-0.5">
        <Dialog open={editOpen} onOpenChange={(next) => { setEditOpen(next); if (!next) setError(null); }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Editar categoria">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar categoria</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSaveName} className="flex flex-col gap-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              {error ? <p className="text-sm text-(--expense)">{error}</p> : null}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Excluir categoria">
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
