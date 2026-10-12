import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  PieChart,
  Settings,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Uma lista só pro menu lateral (computador) e pra barra de baixo
// (celular): as duas navegam pelos mesmos lugares, com os mesmos nomes.

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/mes", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/a-pagar", label: "A vencer", icon: CalendarClock },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: TrendingUp },
  { href: "/relatorios", label: "Relatórios", icon: PieChart },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/importar", label: "Importar", icon: Upload },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

/**
 * Na barra de baixo cabem quatro destinos e o botão de lançar. Ficam os
 * do dia a dia; o resto mora em "Mais".
 */
export const MOBILE_PRIMARY = ["/mes", "/transacoes", "/a-pagar"];

export function isActive(pathname: string | null, href: string) {
  return Boolean(pathname && (pathname === href || pathname.startsWith(`${href}/`)));
}

/** Evento que abre o formulário de lançamento de qualquer lugar do app. */
export const NEW_TRANSACTION_EVENT = "velun:novo-lancamento";
