"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  deactivateRecurrence,
  getRecurrenceForEdit,
  updateRecurrence,
  type RecurrenceForEdit,
} from "@/lib/actions/recurrences";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/date-input";
import { AccountSelect } from "@/components/account-select";
import { CategorySelectItems } from "@/components/category-select-items";
import { TONE } from "@/components/manual-transaction-button";
import { currencySymbol, formatCents, type CurrencyCode } from "@/lib/money";
import { amountToCents, normalizeAmount } from "@/lib/amount-input";
import { fitsDirection } from "@/lib/category-kind";
import { describeSchedule, generateOccurrenceDates, usesDayOfMonth, type RecurrenceFrequency } from "@/lib/recurrence";

type Account = { id: string; name: string; type?: string; institution?: string | null };
type Category = { id: string; name: string; kind: "income" | "expense"; is_transfer?: boolean; parent_id?: string | null };

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: "weekly", label: "Semana" },
  { value: "monthly", label: "Mês" },
  { value: "quarterly", label: "3 meses" },
  { value: "semiannual", label: "6 meses" },
  { value: "yearly", label: "Ano" },
];
const NO_CATEGORY = "__none__";
const fieldLabel = "text-[13px] font-semibold text-(--text-body)";
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Editar a recorrência: nome, valor, de quanto em quanto tempo, a
 * próxima vez, quando termina, conta e categoria. Refaz as previsões
 * daqui pra frente; o que já caiu fica como aconteceu.
 */
export function RecurrenceEditDialog({
  recurrenceId,
  accounts,
  categories,
  currency = "USD",
  open,
  onOpenChange,
  onSaved,
}: {
  recurrenceId: string;
  accounts: Account[];
  categories: Category[];
  currency?: CurrencyCode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (message: string) => void;
}) {
  const [data, setData] = useState<RecurrenceForEdit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getRecurrenceForEdit(recurrenceId)
      .then((d) => {
        if (!alive) return;
        if (d) setData(d);
        else setLoadError("Essa recorrência não existe mais.");
      })
      .catch(() => alive && setLoadError("Não consegui abrir essa recorrência agora."));
    return () => {
      alive = false;
    };
  }, [open, recurrenceId]);

  // Fechou: a próxima abertura busca de novo (alguém pode ter mudado).
  function setOpen(next: boolean) {
    if (!next) {
      setData(null);
      setLoadError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] gap-5 overflow-y-auto rounded-[24px] bg-(--bg-surface) p-5 sm:max-w-[540px] sm:p-7"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-[.05em] text-(--text-muted) uppercase">Recorrência</div>
            <DialogTitle className="mt-1 text-[21px] font-extrabold tracking-[-0.02em] text-(--text-primary)">
              Editar recorrência
            </DialogTitle>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-(--bg-hover) text-(--text-secondary) hover:bg-(--bg-strong)"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        {data ? (
          <RecurrenceForm
            key={data.id}
            data={data}
            accounts={accounts}
            categories={categories}
            currency={currency}
            onDone={(message) => {
              setOpen(false);
              onSaved?.(message);
            }}
          />
        ) : loadError ? (
          <p className="text-sm text-(--expense-dark)">{loadError}</p>
        ) : (
          <p className="text-sm text-(--text-muted)">Carregando…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecurrenceForm({
  data,
  accounts,
  categories,
  currency,
  onDone,
}: {
  data: RecurrenceForEdit;
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState(data.description);
  const [amount, setAmount] = useState((data.amount_cents / 100).toFixed(2).replace(".", ","));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(data.frequency);
  const [nextDate, setNextDate] = useState(data.next_date ?? data.today);
  const [endsOn, setEndsOn] = useState(data.ends_on ?? "");
  const [accountId, setAccountId] = useState(data.account_id);
  const [categoryId, setCategoryId] = useState(data.category_id ?? "");
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = TONE[data.direction];
  const options = categories.filter((c) => fitsDirection(c, data.direction));
  const accountChoices = accounts.some((a) => a.id === data.account_id)
    ? accounts
    : [...accounts, { id: data.account_id, name: "Conta atual" }];
  const cents = amountToCents(amount);

  const validNext = /^\d{4}-\d{2}-\d{2}$/.test(nextDate) && nextDate >= data.today;
  const preview = useMemo(
    () =>
      validNext
        ? generateOccurrenceDates({
            frequency,
            startsOn: nextDate,
            dayOfMonth: usesDayOfMonth(frequency) ? Number(nextDate.slice(8, 10)) : null,
            endsOn: endsOn || null,
            count: 3,
            from: data.today,
          })
        : [],
    [validNext, frequency, nextDate, endsOn, data.today],
  );
  const schedule = validNext
    ? describeSchedule({
        frequency,
        startsOn: nextDate,
        dayOfMonth: usesDayOfMonth(frequency) ? Number(nextDate.slice(8, 10)) : null,
      })
    : null;

  function save() {
    setError(null);
    if (cents <= 0) return setError("Coloque o valor.");
    if (!validNext) return setError("A próxima vez tem que ser hoje ou depois.");
    const formData = new FormData();
    formData.set("description", description.trim());
    formData.set("amount", normalizeAmount(amount));
    formData.set("frequency", frequency);
    formData.set("next_date", nextDate);
    formData.set("ends_on", endsOn);
    formData.set("account_id", accountId);
    formData.set("category_id", categoryId);
    startTransition(async () => {
      const result = await updateRecurrence(data.id, formData);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onDone(
        result.changed === 1
          ? "Recorrência salva: 1 previsão atualizada."
          : `Recorrência salva: ${result.changed} previsões atualizadas.`,
      );
    });
  }

  function stop() {
    startTransition(async () => {
      try {
        await deactivateRecurrence(data.id);
        router.refresh();
        onDone("Recorrência parada. As previsões saíram; o que já caiu ficou.");
      } catch {
        setError("Não consegui parar essa recorrência agora.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-name" className={fieldLabel}>
            Nome
          </Label>
          <Input id="rec-name" value={description} onChange={(e) => setDescription(e.target.value)} className="h-12 rounded-[12px] text-[15px]" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-amount" className={fieldLabel}>
            Valor
          </Label>
          <div className="flex h-12 items-center gap-1 rounded-[12px] border-[1.5px] border-(--border-primary) px-3.5" style={{ backgroundColor: tone.bg }}>
            <span className="shrink-0 font-bold whitespace-nowrap" style={{ color: tone.strong }}>
              {tone.sign}
              {currencySymbol(currency)}
            </span>
            <input
              id="rec-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full min-w-0 border-0 bg-transparent text-[15px] font-bold tabular-nums outline-none"
              style={{ color: tone.fg }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={fieldLabel}>Repete a cada</span>
        <div role="radiogroup" aria-label="Repete a cada" className="flex gap-1 rounded-[14px] bg-(--bg-hover) p-[5px]">
          {FREQUENCIES.map((f) => {
            const on = f.value === frequency;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFrequency(f.value)}
                className={`h-[42px] min-w-0 flex-1 rounded-[11px] px-1 text-[13px] font-semibold whitespace-nowrap transition-colors sm:text-sm ${
                  on ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.12)]" : "text-(--text-muted) hover:text-(--text-secondary)"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-next" className={fieldLabel}>
            Próxima vez
          </Label>
          <DateInput
            id="rec-next"
            defaultValue={nextDate}
            onChange={setNextDate}
            className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]"
          />
          {schedule ? <span className="text-xs text-(--text-muted)">Depois, {schedule}</span> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-ends" className={fieldLabel}>
            Termina (opcional)
          </Label>
          <DateInput
            id="rec-ends"
            defaultValue={endsOn}
            onChange={setEndsOn}
            className="[&_input]:h-12 [&_input]:rounded-[12px] [&_input]:text-[15px]"
          />
          {!endsOn ? <span className="text-xs text-(--text-muted)">Sem data pra acabar</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-account" className={fieldLabel}>
            Conta
          </Label>
          <AccountSelect id="rec-account" label="Conta" accounts={accountChoices} value={accountId} onChange={setAccountId} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-category" className={fieldLabel}>
            Categoria
          </Label>
          <Select value={categoryId || NO_CATEGORY} onValueChange={(v) => setCategoryId(v === NO_CATEGORY ? "" : v)}>
            <SelectTrigger id="rec-category" className="h-12! w-full rounded-[12px] text-[15px]">
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
              <CategorySelectItems categories={options} />
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[16px] bg-(--primary-soft) px-4 py-3.5">
        <span className="text-[13px] font-bold text-(--text-body)">O que muda ao salvar</span>
        {preview.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {preview.map((d) => (
              <span
                key={d}
                className="inline-flex h-[30px] items-center rounded-full border border-(--border-primary) bg-(--bg-surface) px-3 text-[13px] font-semibold tabular-nums text-(--text-primary)"
              >
                {ddmm(d)} · {cents > 0 ? formatCents(cents, currency) : "—"}
              </span>
            ))}
            <span className="text-[13px] text-(--text-secondary)">e as próximas</span>
          </div>
        ) : null}
        <span className="text-[13px] leading-relaxed text-(--text-secondary)">
          Só as previsões, daqui pra frente. O que já caiu fica como aconteceu.
        </span>
      </div>

      {error ? <p className="text-sm font-medium text-(--expense-dark)">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {confirmStop ? (
          <span className="flex flex-wrap items-center gap-2 text-sm text-(--text-secondary)">
            Parar e tirar as previsões?
            <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={stop}>
              Parar
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirmStop(false)}>
              Não
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmStop(true)}
            className="h-11 w-fit rounded-[12px] px-2 text-sm font-semibold text-(--expense-dark) hover:bg-(--bg-hover)"
          >
            Parar recorrência
          </button>
        )}
        <span className="hidden flex-1 sm:block" />
        <Button
          type="button"
          disabled={isPending}
          onClick={save}
          className="h-[52px] rounded-[14px] px-7 text-[15px] font-bold shadow-[0_8px_20px_rgba(83,109,254,.3)]"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
