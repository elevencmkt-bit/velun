"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, CreditCard, Plus, TrendingDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/date-input";
import { amountToCents } from "@/lib/amount-input";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { createGoal } from "@/lib/actions/goals";
import { monthsUntil, type GoalKind } from "@/lib/goal-math";

export type GoalAccountOption = { id: string; name: string; type: string; couple: boolean; mine: boolean };
export type GoalCategoryOption = { id: string; name: string };

const KINDS: { kind: GoalKind; title: string; hint: string; Icon: typeof Plus; tone: string }[] = [
  { kind: "save", title: "Juntar dinheiro", hint: "Viagem, reserva, entrada de casa", Icon: CircleDollarSign, tone: "var(--primary)" },
  { kind: "limit", title: "Limite de gasto", hint: "Até quanto gastar numa categoria por mês", Icon: TrendingDown, tone: "#E8590C" },
  { kind: "debt", title: "Quitar dívida", hint: "Zerar um cartão ou um empréstimo", Icon: CreditCard, tone: "var(--income-dark)" },
];

const label = "mb-2 block text-[13px] font-semibold text-(--text-body)";
const pill = (on: boolean) =>
  `inline-flex h-10 items-center rounded-full border-[1.5px] px-4 text-sm transition-colors ${
    on
      ? "border-(--primary) bg-(--primary-soft) font-semibold text-(--primary-hover)"
      : "border-(--border-primary) bg-(--bg-surface) font-medium text-(--text-body) hover:border-(--primary-border)"
  }`;

// Caixa de "Nova meta": escolhe o tipo e preenche só o que aquele tipo
// usa. Embaixo, a conta de quanto guardar (ou pagar) por mês.
export function NewGoalDialog({
  accounts,
  categories,
  currency,
  today,
  defaultKind = "save",
  trigger,
}: {
  accounts: GoalAccountOption[];
  categories: GoalCategoryOption[];
  currency: CurrencyCode;
  today: string;
  defaultKind?: GoalKind;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GoalKind>(defaultKind);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [tracking, setTracking] = useState<"deposits" | "account">("deposits");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [start, setStart] = useState("");
  const [mine, setMine] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setKind(defaultKind);
    setName("");
    setTarget("");
    setDate("");
    setTracking("deposits");
    setAccountId("");
    setCategoryId("");
    setStart("");
    setMine(false);
    setShared(false);
    setError(null);
  }

  // Dívida que segue conta: só cartões. Juntar: contas de dinheiro.
  // Meta do casal só segue conta do casal.
  const accountChoices = accounts.filter(
    (a) => (kind === "debt" ? a.type === "credit_card" : a.type !== "credit_card") && (mine ? a.couple || a.mine : a.couple),
  );

  const targetCents = amountToCents(target);
  const startCents = amountToCents(start);
  const months = date ? monthsUntil(today, date) : null;
  const hint =
    kind === "save" && targetCents > 0 && months && tracking === "deposits"
      ? `Pra chegar em ${formatCents(targetCents, currency)}, guarde ${formatCents(Math.ceil(Math.max(0, targetCents - startCents) / months), currency)}/mês (${months} ${months === 1 ? "mês" : "meses"}).`
      : kind === "debt" && tracking === "deposits" && startCents > 0 && months
        ? `Pra zerar ${formatCents(startCents, currency)}, pague ${formatCents(Math.ceil(startCents / months), currency)}/mês (${months} ${months === 1 ? "mês" : "meses"}).`
        : kind === "limit" && targetCents > 0
          ? `Recomeça todo mês. Avisa em amarelo a partir de 80% (${formatCents(Math.round(targetCents * 0.8), currency)}).`
          : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createGoal({
        kind,
        name: name || (kind === "limit" ? (categories.find((c) => c.id === categoryId)?.name ?? "") : ""),
        targetCents: targetCents || null,
        targetDate: date || null,
        tracking: kind === "limit" ? "deposits" : tracking,
        accountId: accountId || null,
        categoryId: categoryId || null,
        startCents,
        mine,
        shared,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="h-11 gap-2 rounded-[14px] px-4 text-[14px] font-semibold">
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nova meta</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div>
            <span className={label}>Que tipo de meta?</span>
            <div role="radiogroup" aria-label="Tipo de meta" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {KINDS.map(({ kind: k, title, hint: h, Icon, tone }) => {
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setKind(k);
                      setAccountId("");
                      setTracking("deposits");
                    }}
                    className={`flex items-center gap-3 rounded-[16px] border-[1.5px] p-3 text-left transition-colors sm:flex-col sm:items-start sm:gap-2 ${
                      on ? "border-(--primary) bg-(--primary-soft)" : "border-(--border-primary) bg-(--bg-surface) hover:border-(--primary-border)"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                      style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <span className={`block text-sm font-bold ${on ? "text-(--primary-hover)" : "text-(--text-primary)"}`}>{title}</span>
                      <span className="block text-xs leading-snug text-(--text-muted)">{h}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {kind === "limit" ? (
            <div>
              <span className={label}>Categoria</span>
              <div role="radiogroup" aria-label="Categoria" className="flex max-h-[168px] flex-wrap gap-2 overflow-y-auto">
                {categories.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={categoryId === c.id} onClick={() => setCategoryId(c.id)} className={pill(categoryId === c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <label>
              <span className={label}>Nome</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "save" ? "Viagem pro Brasil" : "Zerar o cartão"}
                maxLength={80}
                className="h-12 rounded-[14px] text-[15px]"
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {kind !== "debt" ? (
              <label>
                <span className={label}>{kind === "limit" ? "Limite por mês" : "Quanto juntar"}</span>
                <Input
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0,00"
                  className="h-12 rounded-[14px] text-[17px] font-bold"
                />
              </label>
            ) : null}
            {kind !== "limit" ? (
              <div>
                <span className={label}>
                  Até quando <span className="font-normal text-(--text-light)">(opcional)</span>
                </span>
                <DateInput aria-label="Até quando" onChange={setDate} className="h-12 rounded-[14px]" />
              </div>
            ) : null}
          </div>

          {kind !== "limit" ? (
            <div>
              <span className={label}>Como acompanhar</span>
              <div className="flex gap-1 rounded-[14px] bg-(--bg-track) p-1">
                {(
                  [
                    ["deposits", kind === "debt" ? "Pagamentos que eu registrar" : "Valores que eu guardar"],
                    ["account", kind === "debt" ? "Saldo de um cartão" : "Saldo de uma conta"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tracking === value}
                    onClick={() => setTracking(value)}
                    className={`h-10 flex-1 rounded-[11px] text-[13px] font-semibold transition-colors ${
                      tracking === value ? "bg-(--bg-surface) text-(--text-primary) shadow-(--shadow-sm)" : "text-(--text-muted)"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {tracking === "account" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {accountChoices.length === 0 ? (
                    <p className="text-[13px] text-(--text-muted)">
                      {kind === "debt" ? "Nenhum cartão" : "Nenhuma conta"} {mine ? "sua ou do casal" : "do casal"} pra seguir.
                    </p>
                  ) : (
                    accountChoices.map((a) => (
                      <button key={a.id} type="button" aria-pressed={accountId === a.id} onClick={() => setAccountId(a.id)} className={pill(accountId === a.id)}>
                        {a.name}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
              <p className="mt-2 px-0.5 text-xs leading-relaxed text-(--text-muted)">
                {tracking === "account"
                  ? kind === "debt"
                    ? "O que falta é o que o cartão deve agora; cai sozinho conforme a fatura é paga."
                    : "O progresso é o saldo da conta (ex.: uma poupança só pra isso)."
                  : kind === "debt"
                    ? "Você registra cada pagamento na meta."
                    : "Você registra quanto separou, mesmo que o dinheiro fique na conta de sempre."}
              </p>
            </div>
          ) : null}

          {kind !== "limit" && tracking === "deposits" ? (
            <label>
              <span className={label}>
                {kind === "debt" ? "Quanto deve hoje" : "Já tem algum valor guardado?"}{" "}
                {kind === "save" ? <span className="font-normal text-(--text-light)">(opcional)</span> : null}
              </span>
              <Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="0,00" className="h-12 rounded-[14px] text-[15px]" />
            </label>
          ) : null}

          <div>
            <span className={label}>De quem é</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!mine} onClick={() => { setMine(false); setAccountId(""); }} className={pill(!mine)}>
                Do casal
              </button>
              <button type="button" aria-pressed={mine} onClick={() => setMine(true)} className={pill(mine)}>
                Minha
              </button>
            </div>
            {mine ? (
              <label className="mt-3 flex items-center gap-2.5 text-sm text-(--text-body)">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-(--primary)" />
                Quem divide a casa pode ver
              </label>
            ) : (
              <p className="mt-2 px-0.5 text-xs text-(--text-muted)">Os dois veem e alimentam.</p>
            )}
          </div>

          {hint ? (
            <div className="rounded-[16px] bg-(--primary-soft) px-4 py-3.5 text-sm leading-relaxed text-(--primary-hover)">{hint}</div>
          ) : null}
          {error ? <p className="text-sm text-(--danger-text)">{error}</p> : null}

          <Button onClick={submit} disabled={isPending} className="h-[54px] rounded-[14px] text-base font-bold">
            {isPending ? "Criando…" : "Criar meta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
