import { Banknote, CreditCard, LineChart, PiggyBank, Wallet } from "lucide-react";

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro vivo",
  investment: "Investimento",
};

export const ACCOUNT_TYPE_ICONS: Record<string, typeof Wallet> = {
  checking: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Banknote,
  investment: LineChart,
};
