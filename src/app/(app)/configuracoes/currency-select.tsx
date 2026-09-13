"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCurrency } from "@/lib/actions/household";
import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CurrencySelect({ currency }: { currency: CurrencyCode }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(value: string) {
    startTransition(async () => {
      await updateCurrency(value as CurrencyCode);
      router.refresh();
    });
  }

  return (
    <Select value={currency} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(CURRENCY_LABELS) as CurrencyCode[]).map((code) => (
          <SelectItem key={code} value={code}>
            {CURRENCY_LABELS[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
