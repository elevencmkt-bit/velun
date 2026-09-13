"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, createTransfer } from "@/lib/actions/transactions";
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
type Mode = "in" | "out" | "transfer";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ManualTransactionButton({
  accounts,
  categories: initialCategories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("out");
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "n" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const categoriesForDirection = categories.filter(
    (c) => c.kind === (mode === "in" ? "income" : "expense"),
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        if (mode === "transfer") {
          await createTransfer(formData);
        } else {
          formData.set("direction", mode);
          await createTransaction(formData);
        }
        formRef.current?.reset();
        setSelectedCategoryId("");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao lançar.");
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
        formData.set("kind", mode === "in" ? "income" : "expense");
        const id = await createCategory(formData);
        setCategories((prev) => [...prev, { id, name, kind: mode === "in" ? "income" : "expense" }]);
        setSelectedCategoryId(id);
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
        <Button size="sm" title="Atalho: n">
          + Lançamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançamento manual</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setSelectedCategoryId("");
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="out" className="flex-1">
                Saída
              </TabsTrigger>
              <TabsTrigger value="in" className="flex-1">
                Entrada
              </TabsTrigger>
              <TabsTrigger value="transfer" className="flex-1">
                Transferência
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Data</Label>
              <Input id="date" name="date" type="date" defaultValue={todayISO()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor (USD)</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {mode === "transfer" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="from_account_id">De</Label>
                <Select name="from_account_id" required>
                  <SelectTrigger id="from_account_id">
                    <SelectValue placeholder="Conta de origem" />
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
                <Label htmlFor="to_account_id">Para</Label>
                <Select name="to_account_id" required>
                  <SelectTrigger id="to_account_id">
                    <SelectValue placeholder="Conta de destino" />
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
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="account_id">Conta</Label>
              <Select name="account_id" required>
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
          )}

          {mode !== "transfer" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="category_id">Categoria</Label>
              <Select
                name="category_id"
                value={selectedCategoryId}
                onValueChange={setSelectedCategoryId}
              >
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
                  className="w-fit text-left text-sm text-(--ink)/60 underline-offset-2 hover:underline"
                  onClick={() => setNewCategoryOpen(true)}
                >
                  + nova categoria
                </button>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              name="description"
              required={mode !== "transfer"}
              placeholder={mode === "transfer" ? "Transferência" : undefined}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" name="notes" />
          </div>

          {mode !== "transfer" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="is_pending" />
              Ainda não caiu (pendente)
            </label>
          ) : null}

          {error ? <p className="text-sm text-(--out)">{error}</p> : null}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Lançando..." : "Lançar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
