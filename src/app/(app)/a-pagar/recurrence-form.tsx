"use client";

import { localToday } from "@/lib/today";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecurrence } from "@/lib/actions/recurrences";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateInput } from "@/components/date-input";
import { fitsDirection } from "@/lib/category-kind";
import { CategorySelectItems } from "@/components/category-select-items";

type Account = { id: string; name: string };
type Category = { id: string; name: string; kind: "income" | "expense"; is_transfer?: boolean; parent_id?: string | null };
type Frequency = "monthly" | "weekly" | "yearly";

function todayISO() {
  return localToday();
}

const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
};

export function RecurrenceForm({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const categoriesForDirection = categories.filter(
    (c) => fitsDirection(c, direction === "in" ? "in" : "out"),
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("direction", direction);
    formData.set("frequency", frequency);
    startTransition(async () => {
      try {
        await createRecurrence(formData);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao criar recorrência.");
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
        <Button size="sm">Nova recorrência</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova recorrência</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <Tabs value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
            <TabsList className="w-full">
              <TabsTrigger value="out" className="flex-1">
                Saída
              </TabsTrigger>
              <TabsTrigger value="in" className="flex-1">
                Entrada
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" required placeholder="Ex: Aluguel" />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="account_id">Conta</Label>
              <Select name="account_id" required>
                <SelectTrigger id="account_id">
                  <SelectValue placeholder="Conta" />
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="category_id">Categoria</Label>
            <Select name="category_id">
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                <CategorySelectItems categories={categoriesForDirection} />
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="frequency">Frequência</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="starts_on">
                {frequency === "monthly" ? "Primeira ocorrência" : "Data de início"}
              </Label>
              <DateInput id="starts_on" name="starts_on" defaultValue={todayISO()} required />
            </div>
            {frequency === "monthly" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="day_of_month">Dia do mês</Label>
                <Input
                  id="day_of_month"
                  name="day_of_month"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={new Date().getDate()}
                  required
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ends_on">Termina em (opcional)</Label>
                <DateInput id="ends_on" name="ends_on" />
              </div>
            )}
          </div>
          {frequency === "monthly" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="ends_on">Termina em (opcional)</Label>
              <DateInput id="ends_on" name="ends_on" />
            </div>
          ) : null}

          {error ? <p className="text-sm text-(--out)">{error}</p> : null}

          <Button type="submit" size="form" disabled={isPending} className="mt-1 w-full">
            {isPending ? "Criando..." : "Criar recorrência"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
