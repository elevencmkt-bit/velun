"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payCardBill } from "@/lib/actions/cards";
import { localToday } from "@/lib/today";
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

export function PayBillDialog({
  cardId,
  cardName,
  suggestedCents,
  payers,
  defaultPayerId,
  label = "Pagar fatura",
}: {
  cardId: string;
  cardName: string;
  suggestedCents: number;
  payers: { id: string; name: string }[];
  defaultPayerId: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const initialPayer = payers.some((p) => p.id === defaultPayerId)
    ? defaultPayerId!
    : (payers[0]?.id ?? "");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await payCardBill({
        cardId,
        fromAccountId: String(form.get("from") ?? ""),
        date: String(form.get("date") ?? ""),
        amount: String(form.get("amount") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 w-full rounded-[14px] text-[14px] font-semibold">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar fatura · {cardName}</DialogTitle>
        </DialogHeader>
        {payers.length === 0 ? (
          <p className="text-sm text-(--text-muted)">
            Você precisa de uma conta corrente sua ou do casal pra pagar. Crie
            uma em Contas.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pay-amount">Valor</Label>
              <Input
                id="pay-amount"
                name="amount"
                inputMode="decimal"
                required
                defaultValue={(suggestedCents / 100).toFixed(2)}
              />
              <p className="text-xs text-(--text-muted)">
                Pode pagar só uma parte: o resto continua na fatura seguinte.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="pay-from">Sai de</Label>
                <Select name="from" defaultValue={initialPayer}>
                  <SelectTrigger id="pay-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {payers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pay-date">Data</Label>
                <Input
                  id="pay-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={localToday()}
                />
              </div>
            </div>
            {error ? (
              <p
                className="text-sm"
                style={{ color: "var(--expense-dark)" }}
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando…" : "Registrar pagamento"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
