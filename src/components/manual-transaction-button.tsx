"use client";

import { localToday } from "@/lib/today";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, X } from "lucide-react";
import { createTransaction, createTransfer } from "@/lib/actions/transactions";
import { createCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NEW_TRANSACTION_EVENT } from "@/components/nav-items";
import { DateInput } from "@/components/date-input";
import { AccountAvatar } from "@/components/account-avatar";
import { buildCategoryColorMap } from "@/lib/category-colors";
import { getCategoryIcon } from "@/lib/category-icons";
import { amountToCents, normalizeAmount } from "@/lib/amount-input";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { fitsDirection } from "@/lib/category-kind";
import { topOf } from "@/lib/subcategories";
import { SubcategoryChips } from "@/components/subcategory-chips";
import { themedBg, themedFg, themedPair } from "@/lib/theme-color";

type Account = { id: string; name: string; type?: string; institution?: string | null };
type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  icon?: string | null;
  color?: string | null;
  is_transfer?: boolean;
  /** Preenchido quando é subcategoria. */
  parent_id?: string | null;
};
type Mode = "in" | "out" | "transfer";

const LAST_ACCOUNT_KEY = "velun:last-account";

// Cor de cada tipo: o tipo escolhido pinta a aba, o bloco do valor e a
// categoria marcada, pra não ter dúvida do que se está lançando.
export const TONE: Record<Mode, { bg: string; fg: string; strong: string; label: string; sign: string }> = {
  out: { bg: themedBg("#FEF3F2", "#F04438"), fg: themedFg("#B42318"), strong: themedFg("#D92D20"), label: "saída", sign: "−" },
  in: { bg: themedBg("#ECFDF3", "#12B76A"), fg: themedFg("#067647"), strong: themedFg("#079455"), label: "entrada", sign: "+" },
  transfer: { bg: themedBg("#EEF1FF", "#536DFE"), fg: themedFg("#3538CD"), strong: themedFg("#536DFE"), label: "transferência", sign: "" },
};

const MODES: { value: Mode; label: string; Icon: typeof ArrowUpRight }[] = [
  { value: "out", label: "Saída", Icon: ArrowUpRight },
  { value: "in", label: "Entrada", Icon: ArrowDownLeft },
  { value: "transfer", label: "Transferência", Icon: ArrowLeftRight },
];

function readLastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function saveLastAccount(id: string) {
  try {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // sem armazenamento: só não lembra a conta da próxima vez
  }
}

/** Contas em blocos: com poucas contas, um clique vale mais que uma lista. */
export function AccountPicker({
  accounts,
  value,
  onChange,
  exclude,
  label,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {accounts
        .filter((a) => a.id !== exclude)
        .map((a) => {
          const on = a.id === value;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(a.id)}
              className={`flex h-14 items-center gap-2.5 rounded-[14px] border-[1.5px] px-3 text-left transition-colors ${
                on
                  ? "border-(--primary) bg-(--primary-soft) shadow-[0_0_0_3px_rgba(83,109,254,.12)]"
                  : "border-(--border-primary) bg-(--bg-surface) hover:border-(--primary-border)"
              }`}
            >
              <AccountAvatar institution={a.institution ?? null} type={a.type ?? "checking"} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-(--text-primary)">{a.name}</span>
                <span className="block text-xs text-(--text-muted)">
                  {a.type === "credit_card" ? "Cartão" : a.type === "investment" ? "Investimento" : "Conta"}
                </span>
              </span>
            </button>
          );
        })}
    </div>
  );
}

/** Interruptor de liga/desliga com explicação curta. */
export function ToggleRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 border-t border-(--border-soft) py-3.5 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-(--text-primary)">{title}</span>
        <span className="block text-xs text-(--text-muted)">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-(--primary)" : "bg-(--border-strong)"}`}
      >
        <span
          className={`absolute top-[3px] h-5 w-5 rounded-full bg-(--bg-surface) shadow-sm transition-all ${checked ? "left-[21px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}

export function ManualTransactionButton({
  accounts,
  categories: initialCategories,
  currency = "USD",
}: {
  accounts: Account[];
  categories: Category[];
  currency?: CurrencyCode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("out");
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  // Já vem marcada a última conta usada (ou a primeira conta corrente).
  // O formulário só aparece aberto, no navegador, então ler o
  // armazenamento aqui não dá diferença entre servidor e navegador.
  const [defaultAccount] = useState(() => {
    const last = typeof window === "undefined" ? null : readLastAccount();
    if (last && accounts.some((a) => a.id === last)) return last;
    return accounts.find((a) => a.type !== "credit_card")?.id ?? accounts[0]?.id ?? "";
  });
  const [accountId, setAccountId] = useState(defaultAccount);
  const [fromAccountId, setFromAccountId] = useState(defaultAccount);
  const [toAccountId, setToAccountId] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState("monthly");
  const [installments, setInstallments] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const tone = TONE[mode];
  const isCard = accounts.find((a) => a.id === accountId)?.type === "credit_card";
  const parcelado = mode === "out" && isCard && Number(installments) > 1;
  const cents = amountToCents(amount);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "n" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    // O "+" da barra de baixo do celular abre este mesmo formulário.
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(NEW_TRANSACTION_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(NEW_TRANSACTION_EVENT, onOpenRequest);
    };
  }, []);

  const colors = useMemo(
    () => buildCategoryColorMap(categories.map((c) => ({ name: c.name, kind: c.kind, color: c.color ?? null }))),
    [categories],
  );
  const categoriesForDirection = categories.filter((c) => fitsDirection(c, mode === "in" ? "in" : "out"));
  // Categoria principal escolhida (a própria, ou a "mãe" da sub escolhida).
  const selectedTop = topOf(categories, categoryId);

  function reset() {
    formRef.current?.reset();
    setCategoryId("");
    setAmount("");
    setNotesOpen(false);
    setPending(false);
    setMakeRecurring(false);
    setRecurrenceFrequency("monthly");
    setInstallments("1");
    setToAccountId("");
    setNewCategoryOpen(false);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (cents <= 0) {
      setError("Coloque o valor.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("amount", normalizeAmount(amount));
    if (mode === "transfer") {
      if (!fromAccountId || !toAccountId) {
        setError("Escolha de qual conta sai e pra qual vai.");
        return;
      }
      formData.set("from_account_id", fromAccountId);
      formData.set("to_account_id", toAccountId);
    } else {
      if (!accountId) {
        setError("Escolha a conta.");
        return;
      }
      formData.set("account_id", accountId);
      formData.set("direction", mode);
      formData.set("category_id", categoryId);
      if (pending && !parcelado) formData.set("is_pending", "on");
      if (makeRecurring && !parcelado) formData.set("make_recurring", "on");
    }
    startTransition(async () => {
      try {
        if (mode === "transfer") await createTransfer(formData);
        else await createTransaction(formData);
        saveLastAccount(mode === "transfer" ? fromAccountId : accountId);
        reset();
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
    const kind = mode === "in" ? "income" : "expense";
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

  const submitLabel = isPending
    ? "Lançando…"
    : cents > 0
      ? `Lançar ${tone.label} de ${formatCents(cents, currency)}`
      : `Lançar ${tone.label}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button title="Atalho: n" className="h-11 rounded-[14px] px-4.5 text-[14px] font-semibold">
          + Lançamento
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-5 overflow-y-auto rounded-[24px] bg-(--bg-surface) p-5 sm:max-w-[540px] sm:p-7"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-[21px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
            Novo lançamento
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

        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
          <div role="tablist" aria-label="Tipo" className="flex gap-1.5 rounded-[16px] bg-(--bg-hover) p-[5px]">
            {MODES.map(({ value, label, Icon }) => {
              const on = value === mode;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setMode(value);
                    setCategoryId("");
                  }}
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-semibold transition-colors sm:text-[15px] ${
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
            <label htmlFor="amount" className="text-[13px] font-semibold" style={{ color: tone.fg }}>
              Valor
            </label>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[28px] font-bold whitespace-nowrap" style={{ color: tone.strong }}>
                {tone.sign}$
              </span>
              <input
                id="amount"
                name="amount_display"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-[38px] font-extrabold tracking-[-0.03em] tabular-nums outline-none placeholder:opacity-35"
                style={{ color: tone.fg }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date" className="text-[13px] font-semibold text-(--text-body)">
                Data
              </Label>
              <DateInput id="date" name="date" defaultValue={localToday()} required className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description" className="text-[13px] font-semibold text-(--text-body)">
                Descrição
              </Label>
              <Input
                id="description"
                name="description"
                required={mode !== "transfer"}
                placeholder={mode === "transfer" ? "Transferência" : "Ex.: Walmart"}
                className="h-12 rounded-[12px] text-[15px]"
              />
            </div>
          </div>

          {mode === "transfer" ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-(--text-body)">Sai de</span>
                <AccountPicker
                  label="Sai de"
                  accounts={accounts}
                  value={fromAccountId}
                  onChange={(id) => {
                    setFromAccountId(id);
                    if (id === toAccountId) setToAccountId("");
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-(--text-body)">Vai pra</span>
                <AccountPicker
                  label="Vai pra"
                  accounts={accounts}
                  value={toAccountId}
                  onChange={setToAccountId}
                  exclude={fromAccountId}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-(--text-body)">Conta</span>
              <AccountPicker label="Conta" accounts={accounts} value={accountId} onChange={setAccountId} />
            </div>
          )}

          {mode !== "transfer" ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-(--text-body)">Categoria</span>
              <div role="radiogroup" aria-label="Categoria" className="flex flex-wrap gap-2">
                {categoriesForDirection.filter((c) => !c.parent_id).map((c) => {
                  const on = c.id === categoryId || c.id === selectedTop?.id;
                  const color = themedPair(colors.get(c.name) ?? { bg: "#F2F4F7", fg: "#475467" });
                  const Icon = getCategoryIcon(c.name, mode === "in" ? "in" : "out", c.icon ?? null);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCategoryId(on ? "" : c.id)}
                      className={`inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] pr-3.5 pl-2 text-sm transition-colors ${
                        on ? "font-semibold" : "border-(--border-primary) bg-(--bg-surface) font-medium text-(--text-body) hover:border-(--primary-border)"
                      }`}
                      style={on ? { borderColor: color.fg, backgroundColor: color.bg, color: color.fg } : undefined}
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                        style={{ backgroundColor: color.bg, color: color.fg }}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      {c.name}
                    </button>
                  );
                })}
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
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewCategoryOpen(true)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-(--primary-border) px-3.5 text-sm font-semibold text-(--primary) hover:bg-(--primary-soft)"
                  >
                    <Plus className="h-4 w-4" />
                    Nova categoria
                  </button>
                )}
              </div>
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
          ) : null}

          {mode === "out" && isCard ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="installments" className="text-[13px] font-semibold text-(--text-body)">
                Parcelas
              </Label>
              <Select name="installments" value={installments} onValueChange={setInstallments}>
                <SelectTrigger id="installments" className="h-12! w-full rounded-[12px] text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">À vista</SelectItem>
                  {Array.from({ length: 23 }, (_, i) => String(i + 2)).map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} vezes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parcelado ? (
                <p className="text-xs text-(--text-muted)">O valor acima é o total. Cada parcela entra na fatura do seu mês.</p>
              ) : null}
            </div>
          ) : null}

          {notesOpen ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes" className="text-[13px] font-semibold text-(--text-body)">
                Nota
              </Label>
              <Input id="notes" name="notes" autoFocus className="h-12 rounded-[12px] text-[15px]" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="w-fit text-sm font-semibold text-(--primary) hover:underline"
            >
              + Adicionar nota
            </button>
          )}

          {mode !== "transfer" && !parcelado ? (
            <div className="flex flex-col">
              <ToggleRow
                checked={pending}
                onChange={setPending}
                title="Ainda não caiu"
                hint="Fica como pendente até você confirmar"
              />
              <ToggleRow
                checked={makeRecurring}
                onChange={setMakeRecurring}
                title="Repetir esse lançamento"
                hint="Toda semana, mês ou ano"
              />
              {makeRecurring ? (
                <div className="grid grid-cols-2 gap-3.5 pb-1">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="recurrence_frequency" className="text-[13px] font-semibold text-(--text-body)">
                      Frequência
                    </Label>
                    <Select name="recurrence_frequency" value={recurrenceFrequency} onValueChange={setRecurrenceFrequency}>
                      <SelectTrigger id="recurrence_frequency" className="h-12! w-full rounded-[12px] text-[15px]">
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
                    <Label htmlFor="recurrence_ends_on" className="text-[13px] font-semibold text-(--text-body)">
                      Repetir até (opcional)
                    </Label>
                    <DateInput
                      id="recurrence_ends_on"
                      name="recurrence_ends_on"
                      className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm font-medium text-(--expense-dark)">{error}</p> : null}

          <Button
            type="submit"
            disabled={isPending}
            className="h-[54px] rounded-[14px] text-base font-bold shadow-[0_8px_20px_rgba(83,109,254,.3)]"
          >
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
