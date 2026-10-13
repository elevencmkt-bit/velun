"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { CARD_COLORS } from "@/lib/credit-card";
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
  credit_limit_cents?: number | null;
  statement_close_day?: number | null;
  payment_due_day?: number | null;
  payment_account_id?: string | null;
  last_four?: string | null;
  card_color?: string | null;
};

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

export function AccountForm({
  account,
  paymentAccounts = [],
  defaultType,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  account?: EditableAccount;
  /** Contas que podem pagar a fatura de um cartão (correntes do casal ou próprias). */
  paymentAccounts?: { id: string; name: string }[];
  defaultType?: string;
  /** Botão que abre o formulário, quando não é o padrão. `null`: sem botão (aberto por fora). */
  trigger?: React.ReactNode;
  /** Aberto por fora (ex.: item "Editar" do menu ⋯ da conta). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEdit = Boolean(account);
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInnerOpen(next);
  };
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Controlado porque o seletor de nível só aparece quando a conta é
  // pessoal — conta do casal não tem o que escolher.
  const [ownership, setOwnership] = useState(
    account?.owner_id ? "personal" : "joint",
  );
  // Cartão pede mais campos (fechamento, vencimento…); controlado pra
  // mostrar ou esconder.
  const [type, setType] = useState(account?.type ?? defaultType ?? "checking");
  const isCard = type === "credit_card";
  const [cardColor, setCardColor] = useState(account?.card_color ?? "ink");
  // Saldo inicial negativo (conta que começa no vermelho). Cartão não usa: lá o campo já é "quanto deve".
  const [negative, setNegative] = useState((account?.opening_balance_cents ?? 0) < 0 && account?.type !== "credit_card");

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
        if (!account) setNegative(false);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar conta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (isEdit ? (
            <Button variant="ghost" size="icon" aria-label="Editar conta">
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button>
              <Plus className="h-4 w-4" />
              Nova conta
            </Button>
          ))}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (isCard ? "Editar cartão" : "Editar conta") : isCard ? "Novo cartão" : "Nova conta"}
          </DialogTitle>
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
              placeholder={isCard ? "Ex: Cartão principal" : "Ex: Chase Checking"}
              defaultValue={account?.name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Tipo</Label>
            <Select name="type" value={type} onValueChange={setType} required>
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
          {isCard ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="close_day">Fecha todo dia</Label>
                  <Select name="close_day" defaultValue={String(account?.statement_close_day ?? 28)} required>
                    <SelectTrigger id="close_day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="due_day">Vence todo dia</Label>
                  <Select name="due_day" defaultValue={String(account?.payment_due_day ?? 22)} required>
                    <SelectTrigger id="due_day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="credit_limit">Limite (opcional)</Label>
                  <Input
                    id="credit_limit"
                    name="credit_limit"
                    inputMode="decimal"
                    placeholder="3000.00"
                    defaultValue={account?.credit_limit_cents ? (account.credit_limit_cents / 100).toFixed(2) : ""}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="last_four">Final (opcional)</Label>
                  <Input
                    id="last_four"
                    name="last_four"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4821"
                    defaultValue={account?.last_four ?? ""}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="payment_account_id">Fatura paga com</Label>
                <Select name="payment_account_id" defaultValue={account?.payment_account_id ?? "none"}>
                  <SelectTrigger id="payment_account_id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Escolho na hora</SelectItem>
                    {paymentAccounts
                      .filter((a) => a.id !== account?.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Cor do cartão</legend>
                <input type="hidden" name="card_color" value={cardColor} />
                <div className="flex gap-2.5">
                  {Object.entries(CARD_COLORS).map(([key, c]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCardColor(key)}
                      aria-label={c.label}
                      aria-pressed={cardColor === key}
                      className="h-9 w-12 rounded-lg transition-transform"
                      style={{
                        background: c.bg,
                        boxShadow: cardColor === key ? "0 0 0 2px #FFFFFF, 0 0 0 4px var(--primary)" : "none",
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="opening_balance">
              {isCard ? "Quanto você deve hoje neste cartão" : "Saldo inicial"}
            </Label>
            {isCard ? null : (
              <input type="hidden" name="opening_balance_sign" value={negative ? "negative" : "positive"} />
            )}
            <div className="flex gap-2">
              {isCard ? null : (
                // O teclado numérico do celular não tem "−": o sinal fica num botão.
                <div role="radiogroup" aria-label="Sinal do saldo" className="flex shrink-0 gap-1 rounded-[12px] bg-(--bg-track) p-1">
                  {[
                    { value: false, label: "+", title: "Positivo" },
                    { value: true, label: "−", title: "Negativo" },
                  ].map((o) => (
                    <button
                      key={o.title}
                      type="button"
                      role="radio"
                      aria-checked={negative === o.value}
                      aria-label={o.title}
                      title={o.title}
                      onClick={() => setNegative(o.value)}
                      className={`flex h-10 w-11 items-center justify-center rounded-[9px] text-[20px] font-bold transition-colors ${
                        negative === o.value
                          ? o.value
                            ? "bg-(--bg-surface) text-(--expense-dark) shadow-[0_1px_3px_rgba(16,24,40,.1)]"
                            : "bg-(--bg-surface) text-(--income-dark) shadow-[0_1px_3px_rgba(16,24,40,.1)]"
                          : "text-(--text-muted)"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <Input
                id="opening_balance"
                name="opening_balance"
                type="text"
                inputMode="decimal"
                defaultValue={
                  account
                    ? (Math.abs(account.opening_balance_cents) / 100).toFixed(2)
                    : "0"
                }
                onChange={(e) => {
                  // Quem digita "-" no computador também está dizendo "negativo".
                  if (!isCard && /^\s*[-−]/.test(e.target.value)) {
                    setNegative(true);
                    e.target.value = e.target.value.replace(/^\s*[-−]/, "");
                  }
                }}
                placeholder="0.00"
                className={!isCard && negative ? "text-(--expense-dark)" : undefined}
              />
            </div>
            {isCard ? (
              <p className="text-xs text-(--text-muted)">
                Só o que já estava na fatura antes de você começar a lançar as compras aqui.
              </p>
            ) : negative ? (
              <p className="text-xs text-(--text-muted)">A conta começa no vermelho, devendo esse valor ao banco.</p>
            ) : null}
          </div>
          {error ? <p className="text-sm text-(--out)">{error}</p> : null}
          <Button type="submit" size="form" disabled={isPending} className="mt-1 w-full">
            {isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
