"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHouseholdSettings } from "@/lib/actions/household";
import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/money";
import { COUNTRY_DEFAULTS, COUNTRY_LABELS, TIMEZONES, type CountryCode } from "@/lib/household-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HouseholdSettingsForm({
  country: initialCountry,
  timezone: initialTimezone,
  currency: initialCurrency,
}: {
  country: CountryCode;
  timezone: string;
  currency: CurrencyCode;
}) {
  const [country, setCountry] = useState(initialCountry);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [currency, setCurrency] = useState(initialCurrency);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const changed = country !== initialCountry || timezone !== initialTimezone || currency !== initialCurrency;
  const zones = TIMEZONES.filter((t) => t.country === country);

  // Trocar o país sugere a moeda e o fuso de lá. Os dois continuam
  // editáveis: quem mora nos EUA e controla uma casa no Brasil escolhe.
  function onCountry(value: string) {
    const next = value as CountryCode;
    setCountry(next);
    setCurrency(COUNTRY_DEFAULTS[next].currency);
    setTimezone(COUNTRY_DEFAULTS[next].timezone);
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateHouseholdSettings({ country, timezone, currency });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({ ok: true, text: "Salvo." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label>País</Label>
          <Select value={country} onValueChange={onCountry} disabled={isPending}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COUNTRY_LABELS) as CountryCode[]).map((code) => (
                <SelectItem key={code} value={code}>
                  {COUNTRY_LABELS[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Fuso horário</Label>
          <Select
            value={timezone}
            onValueChange={(v) => {
              setTimezone(v);
              setMessage(null);
            }}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.value} value={z.value}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Moeda</Label>
          <Select
            value={currency}
            onValueChange={(v) => {
              setCurrency(v as CurrencyCode);
              setMessage(null);
            }}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
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
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-(--text-muted)">
          {currency !== initialCurrency
            ? "Trocar a moeda não converte nada: os valores continuam os mesmos, só muda o símbolo."
            : "O fuso decide o que é “hoje”: o que está atrasado e o que vence esta semana."}
        </p>
        <div className="flex items-center gap-3">
          {message ? (
            <span
              className="text-sm"
              style={{ color: message.ok ? "var(--income-dark)" : "var(--expense-dark)" }}
              role="status"
            >
              {message.text}
            </span>
          ) : null}
          <Button onClick={save} disabled={!changed || isPending}>
            {isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
