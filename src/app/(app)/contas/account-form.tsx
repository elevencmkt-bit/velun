"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro vivo",
  investment: "Investimento",
};

// Cada nível é descrito pelo que o OUTRO membro vê, não pelo nome
// técnico. A pessoa está decidindo quanto mostrar, então é esse o texto
// que importa na hora da escolha.
const VISIBILITY_LABELS: Record<string, string> = {
  hidden: "Ninguém mais vê esta conta",
  balance_only: "Só o saldo aparece",
  categories_only: "Saldo e categorias, sem os lançamentos",
  shared: "Tudo visível, como uma conta do casal",
};

export type EditableAccount = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  opening_balance_cents: number;
  owner_id: string | null;
  visibility: string;
};

export function AccountForm({ account }: { account?: EditableAccount }) {
  const isEdit = Boolean(account);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Controlado porque o seletor de nível só aparece quando a conta é
  // pessoal — conta do casal não tem o que escolher.
  const [ownership, setOwnership] = useState(
    account?.owner_id ? "personal" : "joint",
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        if (account) {
          await updateAccount(account.id, formData);
        } else {
          await createAccount(formData);
        }
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar conta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Editar conta">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">Nova conta</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar conta" : "Nova conta"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ownership">De quem é esta conta</Label>
            <Select
              name="ownership"
              value={ownership}
              onValueChange={setOwnership}
              required
            >
              <SelectTrigger id="ownership">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="joint">Conta do casal</SelectItem>
                <SelectItem value="personal">Conta pessoal (minha)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-(--text-muted)">
              {ownership === "joint"
                ? "Tudo que entra e sai fica visível para os dois."
                : "Só você lança nela. Você escolhe abaixo o que aparece no painel do casal."}
            </p>
          </div>

          {ownership === "personal" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="visibility">O que o outro membro vê</Label>
              <Select
                name="visibility"
                defaultValue={
                  account?.owner_id ? account.visibility : "categories_only"
                }
                required
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Ex: Chase Checking"
              defaultValue={account?.name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Tipo</Label>
            <Select name="type" defaultValue={account?.type ?? "checking"} required>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="institution">Instituição (opcional)</Label>
            <Input
              id="institution"
              name="institution"
              placeholder="Ex: Chase"
              defaultValue={account?.institution ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="opening_balance">Saldo inicial (USD)</Label>
            <Input
              id="opening_balance"
              name="opening_balance"
              type="text"
              inputMode="decimal"
              defaultValue={
                account ? (account.opening_balance_cents / 100).toFixed(2) : "0"
              }
              placeholder="0.00"
            />
          </div>
          {error ? <p className="text-sm text-(--out)">{error}</p> : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
