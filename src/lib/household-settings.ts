import type { CurrencyCode } from "@/lib/money";

export type CountryCode = "US" | "BR";

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  US: "Estados Unidos",
  BR: "Brasil",
};

/** Moeda e fuso sugeridos quando a pessoa escolhe o país. */
export const COUNTRY_DEFAULTS: Record<CountryCode, { currency: CurrencyCode; timezone: string }> = {
  US: { currency: "USD", timezone: "America/New_York" },
  BR: { currency: "BRL", timezone: "America/Sao_Paulo" },
};

export const TIMEZONES: { value: string; label: string; country: CountryCode }[] = [
  { value: "America/New_York", label: "Leste (Nova York, Orlando, Miami)", country: "US" },
  { value: "America/Chicago", label: "Central (Chicago, Dallas)", country: "US" },
  { value: "America/Denver", label: "Montanhas (Denver)", country: "US" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)", country: "US" },
  { value: "America/Los_Angeles", label: "Pacífico (Los Angeles)", country: "US" },
  { value: "America/Anchorage", label: "Alasca", country: "US" },
  { value: "Pacific/Honolulu", label: "Havaí", country: "US" },
  { value: "America/Sao_Paulo", label: "Brasília (SP, RJ, MG, Sul, Nordeste)", country: "BR" },
  { value: "America/Manaus", label: "Amazonas (Manaus)", country: "BR" },
  { value: "America/Cuiaba", label: "Mato Grosso (Cuiabá)", country: "BR" },
  { value: "America/Rio_Branco", label: "Acre (Rio Branco)", country: "BR" },
  { value: "America/Noronha", label: "Fernando de Noronha", country: "BR" },
];
