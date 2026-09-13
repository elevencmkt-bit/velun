"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccount } from "@/lib/actions/accounts";
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

export function AccountForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await createAccount(formData);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao criar conta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nova conta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required placeholder="Ex: Chase Checking" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Tipo</Label>
            <Select name="type" defaultValue="checking" required>
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
            <Input id="institution" name="institution" placeholder="Ex: Chase" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="opening_balance">Saldo inicial (USD)</Label>
            <Input
              id="opening_balance"
              name="opening_balance"
              type="text"
              inputMode="decimal"
              defaultValue="0"
              placeholder="0.00"
            />
          </div>
          {error ? <p className="text-sm text-(--out)">{error}</p> : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando..." : "Criar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
