"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCashFloor } from "@/lib/actions/household";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amountToCents, normalizeAmount } from "@/lib/amount-input";
import { formatCents, type CurrencyCode } from "@/lib/money";

type Mode = "auto" | "manual" | "off";

/** Piso de segurança: automático pelas metas, valor fixo ou sem piso. */
export function CashFloorForm({
  manualCents,
  goalsCents,
  goals,
  currency,
}: {
  /** O que está gravado: null = automático. */
  manualCents: number | null;
  goalsCents: number;
  goals: { name: string; cents: number }[];
  currency: CurrencyCode;
}) {
  const initialMode: Mode = manualCents === null ? "auto" : manualCents === 0 ? "off" : "manual";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState(
    manualCents && manualCents > 0 ? (manualCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setMessage(null);
    let cents: number | null = null;
    if (mode === "off") cents = 0;
    if (mode === "manual") {
      cents = amountToCents(normalizeAmount(amount));
      if (cents <= 0) return setMessage({ ok: false, text: "Coloque o valor do piso." });
    }
    startTransition(async () => {
      const result = await updateCashFloor(cents);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: "Salvo." });
      router.refresh();
    });
  }

  const option = (value: Mode, title: string, hint: React.ReactNode) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-4 py-3 ${
        mode === value ? "border-(--primary) bg-(--primary-soft)" : "border-(--border-soft)"
      }`}
    >
      <input
        type="radio"
        name="cash-floor-mode"
        className="mt-1 accent-(--primary)"
        checked={mode === value}
        onChange={() => {
          setMode(value);
          setMessage(null);
        }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-(--text-primary)">{title}</span>
        <span className="block text-xs leading-relaxed text-(--text-muted)">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      {option(
        "auto",
        `Automático${goalsCents > 0 ? `: ${formatCents(goalsCents, currency)}` : ""}`,
        goals.length > 0
          ? `Soma das metas ${goals.map((g) => `${g.name} (${formatCents(g.cents, currency)})`).join(" e ")}.`
          : "Soma das metas de juntar “Colchão” e “Reserva de impostos”. Nenhuma criada ainda: sem piso por enquanto.",
      )}
      {option(
        "manual",
        "Valor fixo",
        mode === "manual" ? (
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2 h-11 max-w-[200px] rounded-[12px] text-[15px]"
          />
        ) : (
          "Um valor que você escolhe."
        ),
      )}
      {option("off", "Sem piso", "A linha e os “dias abaixo do piso” somem do Fluxo de caixa.")}
      <div className="flex items-center justify-between gap-3">
        {message ? (
          <p className={`text-sm ${message.ok ? "text-(--income-dark)" : "text-(--out)"}`}>{message.text}</p>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
