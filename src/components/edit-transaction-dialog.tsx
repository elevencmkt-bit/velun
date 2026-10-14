"use client";

import { currencySymbol, type CurrencyCode } from "@/lib/money";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Pencil, X } from "lucide-react";
import { updateTransaction } from "@/lib/actions/transactions";
import { createCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/date-input";
import { TONE, ToggleRow } from "@/components/manual-transaction-button";
import { AccountSelect } from "@/components/account-select";
import { GoalLinkField } from "@/components/goal-link-field";
import { buildCategoryColorMap } from "@/lib/category-colors";
import { amountToCents, normalizeAmount } from "@/lib/amount-input";
import { fitsDirection } from "@/lib/category-kind";
import { topOf } from "@/lib/subcategories";
import { SubcategoryChips } from "@/components/subcategory-chips";
import { CategoryQuickPicker } from "@/components/category-quick-picker";
import { themedPair } from "@/lib/theme-color";

type Account = { id: string; name: string; type?: string; institution?: string | null };
type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  is_transfer?: boolean;
  color?: string | null;
  icon?: string | null;
  /** Preenchido quando é subcategoria. */
  parent_id?: string | null;
};

export type EditableTransaction = {
  id: string;
  date: string;
  account_id: string;
  category_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  description: string;
  notes: string | null;
  bank_description?: string | null;
  status: "pending" | "cleared";
  recurrence_id: string | null;
};

const MODES = [
  { value: "out" as const, label: "Saída", Icon: ArrowUpRight },
  { value: "in" as const, label: "Entrada", Icon: ArrowDownLeft },
];

const fieldLabel = "text-[13px] font-semibold text-(--text-body)";

// Mesma cara da caixa de "Novo lançamento": tipo com cor, valor em
// destaque, contas e categorias em botões. Aqui não tem transferência
// (transferência se edita pelos dois lados) nem parcelamento.
export function EditTransactionDialog({
  transaction,
  accounts,
  categories: initialCategories,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  currency = "USD",
}: {
  transaction: EditableTransaction;
  accounts: Account[];
  categories: Category[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  currency?: CurrencyCode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [direction, setDirection] = useState<"in" | "out">(transaction.direction);
  const [amount, setAmount] = useState((transaction.amount_cents / 100).toFixed(2).replace(".", ","));
  const [accountId, setAccountId] = useState(transaction.account_id);
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [notesOpen, setNotesOpen] = useState(Boolean(transaction.notes));
  const [pending, setPending] = useState(transaction.status === "pending");
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState("monthly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const tone = TONE[direction];
  const colors = useMemo(
    () => buildCategoryColorMap(categories.map((c) => ({ name: c.name, kind: c.kind, color: c.color ?? null }))),
    [categories],
  );
  const categoriesForDirection = categories.filter((c) => fitsDirection(c, direction));
  // Categoria principal escolhida (a própria, ou a "mãe" da sub escolhida).
  const selectedTop = topOf(categories, categoryId);
  // A conta atual sempre aparece, mesmo se não estiver na lista.
  const accountChoices = accounts.some((a) => a.id === transaction.account_id)
    ? accounts
    : [...accounts, { id: transaction.account_id, name: "Conta atual" }];

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (amountToCents(amount) <= 0) {
      setError("Coloque o valor.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("amount", normalizeAmount(amount));
    formData.set("direction", direction);
    formData.set("account_id", accountId);
    formData.set("category_id", categoryId);
    if (pending) formData.set("is_pending", "on");
    else formData.delete("is_pending");
    if (makeRecurring) formData.set("make_recurring", "on");
    startTransition(async () => {
      try {
        await updateTransaction(transaction.id, formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  function onCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const kind = direction === "in" ? "income" : "expense";
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", name);
        formData.set("kind", kind);
        const id = await createCategory(formData);
        setCategories((prev) => [...prev, { id, name, kind }]);
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
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Editar transação">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-5 overflow-y-auto rounded-[24px] bg-(--bg-surface) p-5 sm:max-w-[540px] sm:p-7"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-[21px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
            Editar lançamento
          </DialogTitle>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-(--bg-hover) text-(--text-secondary) hover:bg-(--bg-strong)"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div role="tablist" aria-label="Tipo" className="flex gap-1.5 rounded-[16px] bg-(--bg-hover) p-[5px]">
            {MODES.map(({ value, label, Icon }) => {
              const on = value === direction;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setDirection(value);
                    // Categoria de despesa não serve pra entrada (e vice-versa).
                    const current = categories.find((c) => c.id === categoryId);
                    if (current && !fitsDirection(current, value)) setCategoryId("");
                  }}
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[15px] font-semibold transition-colors ${
                    on ? "bg-(--bg-surface) shadow-[0_1px_3px_rgba(16,24,40,.12)]" : "text-(--text-muted) hover:text-(--text-secondary)"
                  }`}
                  style={on ? { color: TONE[value].fg } : undefined}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.4} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1 rounded-[18px] px-5 py-4" style={{ backgroundColor: tone.bg }}>
            <label htmlFor="edit-amount" className="text-[13px] font-semibold" style={{ color: tone.fg }}>
              Valor
            </label>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[28px] font-bold whitespace-nowrap" style={{ color: tone.strong }}>
                {tone.sign}{currencySymbol(currency)}
              </span>
              <input
                id="edit-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-[38px] font-extrabold tracking-[-0.03em] tabular-nums outline-none"
                style={{ color: tone.fg }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-date" className={fieldLabel}>
                Data
              </Label>
              <DateInput
                id="edit-date"
                name="date"
                defaultValue={transaction.date}
                required
                className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-description" className={fieldLabel}>
                Descrição
              </Label>
              <Input
                id="edit-description"
                name="description"
                required
                defaultValue={transaction.description}
                className="h-12 rounded-[12px] text-[15px]"
              />
            </div>
          </div>
          {transaction.bank_description && transaction.bank_description !== transaction.description ? (
            <p className="-mt-3 rounded-[12px] bg-(--bg-subtle) px-3.5 py-2.5 text-xs leading-relaxed text-(--text-muted)">
              Como veio do banco: <span className="text-(--text-secondary)">{transaction.bank_description}</span>
              <br />
              Se você renomear, as próximas importações já trazem esse nome.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-account" className={fieldLabel}>
              Conta
            </Label>
            <AccountSelect id="edit-account" label="Conta" accounts={accountChoices} value={accountId} onChange={setAccountId} />
          </div>

          <div className="flex flex-col gap-2">
            <span className={fieldLabel}>Categoria</span>
            <CategoryQuickPicker
              categories={categoriesForDirection.filter((c) => !c.parent_id)}
              allCategories={categories}
              direction={direction}
              selectedTopId={selectedTop?.id ?? null}
              colors={colors}
              onSelect={setCategoryId}
              onNewCategory={() => setNewCategoryOpen(true)}
            />
            {newCategoryOpen ? (
              <div className="flex w-full gap-2">
                  <Input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nome da nova categoria"
                    className="h-10 rounded-[12px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCreateCategory();
                      }
                    }}
                  />
                  <Button type="button" onClick={onCreateCategory} disabled={isPending} className="h-10 rounded-[12px]">
                    Criar
                  </Button>
                </div>
            ) : null}
            {selectedTop ? (
              <SubcategoryChips
                parent={selectedTop}
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                onCreated={(c) => setCategories((prev) => [...prev, c])}
                color={themedPair(colors.get(selectedTop.name) ?? { bg: "#F2F4F7", fg: "#475467" })}
              />
            ) : null}
          </div>

          {transaction.status === "cleared" ? <GoalLinkField transactionId={transaction.id} /> : null}

          {notesOpen ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-notes" className={fieldLabel}>
                Nota
              </Label>
              <Input id="edit-notes" name="notes" defaultValue={transaction.notes ?? ""} className="h-12 rounded-[12px] text-[15px]" />
            </div>
          ) : (
            <button type="button" onClick={() => setNotesOpen(true)} className="w-fit text-sm font-semibold text-(--primary) hover:underline">
              + Adicionar nota
            </button>
          )}

          <div className="flex flex-col">
            <ToggleRow checked={pending} onChange={setPending} title="Ainda não caiu" hint="Fica como pendente até você confirmar" />
            {transaction.recurrence_id ? (
              <p className="border-t border-(--border-soft) py-3.5 text-sm text-(--text-muted)">
                Esse lançamento já faz parte de uma recorrência.
              </p>
            ) : (
              <>
                <ToggleRow checked={makeRecurring} onChange={setMakeRecurring} title="Repetir esse lançamento" hint="Toda semana, mês ou ano" />
                {makeRecurring ? (
                  <div className="grid grid-cols-2 gap-3.5 pb-1">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="edit-recurrence-frequency" className={fieldLabel}>
                        Frequência
                      </Label>
                      <Select name="recurrence_frequency" value={recurrenceFrequency} onValueChange={setRecurrenceFrequency}>
                        <SelectTrigger id="edit-recurrence-frequency" className="h-12! w-full rounded-[12px] text-[15px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="edit-recurrence-ends" className={fieldLabel}>
                        Repetir até (opcional)
                      </Label>
                      <DateInput
                        id="edit-recurrence-ends"
                        name="recurrence_ends_on"
                        className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]"
                      />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {error ? <p className="text-sm font-medium text-(--expense-dark)">{error}</p> : null}

          {/* Excluir mora aqui também: no celular a lista não mostra a
              lixeira, e editar é o único caminho até o lançamento. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DeleteTransactionButton
              transactionId={transaction.id}
              transferGroupId={null}
              variant="text"
              onDeleted={() => setOpen(false)}
            />
            <Button
              type="submit"
              disabled={isPending}
              className="h-[54px] rounded-[14px] px-7 text-base font-bold shadow-[0_8px_20px_rgba(83,109,254,.3)]"
            >
              {isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
