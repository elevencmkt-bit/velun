"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateTransaction } from "@/lib/actions/transactions";
import { createCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Account = { id: string; name: string };
type Category = { id: string; name: string; kind: "income" | "expense" };

export type EditableTransaction = {
  id: string;
  date: string;
  account_id: string;
  category_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  description: string;
  notes: string | null;
  status: "pending" | "cleared";
};

export function EditTransactionDialog({
  transaction,
  accounts,
  categories: initialCategories,
}: {
  transaction: EditableTransaction;
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">(transaction.direction);
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const categoriesForDirection = categories.filter(
    (c) => c.kind === (direction === "in" ? "income" : "expense"),
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("direction", direction);
    startTransition(async () => {
      try {
        await updateTransaction(transaction.id, formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar transação.");
      }
    });
  }

  function onCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", name);
        formData.set("kind", direction === "in" ? "income" : "expense");
        const id = await createCategory(formData);
        setCategories((prev) => [...prev, { id, name, kind: direction === "in" ? "income" : "expense" }]);
        setCategoryId(id);
        setNewCategoryName("");
        setNewCategoryOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao criar categoria.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Editar transação">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar transação</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Tabs
            value={direction}
            onValueChange={(v) => {
              setDirection(v as "in" | "out");
              setCategoryId("");
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="out" className="flex-1">
                Saída
              </TabsTrigger>
              <TabsTrigger value="in" className="flex-1">
                Entrada
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Data</Label>
              <Input id="date" name="date" type="date" defaultValue={transaction.date} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor (USD)</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                defaultValue={(transaction.amount_cents / 100).toFixed(2)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="account_id">Conta</Label>
            <Select name="account_id" defaultValue={transaction.account_id} required>
              <SelectTrigger id="account_id">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category_id">Categoria</Label>
            <Select name="category_id" value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                {categoriesForDirection.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newCategoryOpen ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nome da nova categoria"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onCreateCategory();
                    }
                  }}
                />
                <Button type="button" size="sm" onClick={onCreateCategory} disabled={isPending}>
                  Criar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="w-fit text-left text-sm text-(--text-muted) underline-offset-2 hover:underline"
                onClick={() => setNewCategoryOpen(true)}
              >
                + nova categoria
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              name="description"
              required
              defaultValue={transaction.description}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" name="notes" defaultValue={transaction.notes ?? ""} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="is_pending" defaultChecked={transaction.status === "pending"} />
            Ainda não caiu (pendente)
          </label>

          {error ? <p className="text-sm text-(--out)">{error}</p> : null}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
