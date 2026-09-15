import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Banknote,
  Bus,
  Car,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  PawPrint,
  Plane,
  Repeat2,
  ShoppingCart,
  Tag,
  Ticket,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Ícones selecionáveis manualmente (Configurações > categoria) — a
// mesma lista alimenta o fallback automático por palavra-chave abaixo.
export type CategoryIconOption = { key: string; icon: LucideIcon; label: string };

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: "banknote", icon: Banknote, label: "Salário" },
  { key: "laptop", icon: Laptop, label: "Serviços" },
  { key: "trending-up", icon: TrendingUp, label: "Investimento" },
  { key: "repeat", icon: Repeat2, label: "Assinatura" },
  { key: "bus", icon: Bus, label: "Transporte" },
  { key: "car", icon: Car, label: "Carro" },
  { key: "shopping-cart", icon: ShoppingCart, label: "Compras" },
  { key: "utensils", icon: UtensilsCrossed, label: "Alimentação" },
  { key: "graduation-cap", icon: GraduationCap, label: "Educação" },
  { key: "heart-pulse", icon: HeartPulse, label: "Saúde" },
  { key: "home", icon: Home, label: "Moradia" },
  { key: "gamepad", icon: Gamepad2, label: "Lazer" },
  { key: "ticket", icon: Ticket, label: "Shows" },
  { key: "plane", icon: Plane, label: "Viagem" },
  { key: "gift", icon: Gift, label: "Presente" },
  { key: "paw-print", icon: PawPrint, label: "Pet" },
  { key: "dumbbell", icon: Dumbbell, label: "Academia" },
  { key: "tag", icon: Tag, label: "Outros" },
];

const ICON_BY_KEY = new Map(CATEGORY_ICON_OPTIONS.map((opt) => [opt.key, opt.icon]));

// Casamento por palavra-chave no nome da categoria — usado quando a
// categoria não tem ícone escolhido manualmente. Categorias são
// livres/customizadas pelo usuário, não um enum fixo.
const KEYWORD_ICONS: [string[], LucideIcon][] = [
  [["salário", "salario", "renda", "pró-labore", "pro-labore"], Banknote],
  [["freelance", "prestação de serviço", "prestacao de servico", "serviço", "servico"], Laptop],
  [["investimento", "rendimento", "dividendo"], TrendingUp],
  [["assinatura", "streaming"], Repeat2],
  [["transporte", "uber", "combustível", "combustivel", "estacionamento"], Bus],
  [["carro", "veículo", "veiculo"], Car],
  [["compra", "shopping"], ShoppingCart],
  [["alimentação", "alimentacao", "mercado", "restaurante", "comida"], UtensilsCrossed],
  [["educação", "educacao", "escola", "curso", "faculdade"], GraduationCap],
  [["saúde", "saude", "farmácia", "farmacia", "médico", "medico"], HeartPulse],
  [["moradia", "aluguel", "casa", "condomínio", "condominio"], Home],
  [["lazer", "jogo", "entretenimento"], Gamepad2],
  [["show", "evento", "ingresso", "festa"], Ticket],
  [["viagem", "viagens", "hotel"], Plane],
  [["presente", "doação", "doacao"], Gift],
  [["pet", "pets", "veterinário", "veterinario"], PawPrint],
  [["academia", "esporte", "fitness"], Dumbbell],
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// `iconKey` vem de categories.icon (escolha manual). Sem escolha
// manual ou chave desconhecida, cai no palpite por palavra-chave e,
// por fim, num ícone genérico por tipo (entrada/despesa).
export function getCategoryIcon(
  categoryName: string | null,
  direction: "in" | "out",
  iconKey?: string | null,
): LucideIcon {
  if (iconKey) {
    const manual = ICON_BY_KEY.get(iconKey);
    if (manual) return manual;
  }

  if (categoryName) {
    const normalized = normalize(categoryName);
    for (const [keywords, icon] of KEYWORD_ICONS) {
      if (keywords.some((k) => normalized.includes(normalize(k)))) return icon;
    }
  }

  return direction === "in" ? Banknote : Tag;
}

// Mapa nome -> ícone escolhido manualmente (ou null) — mesmo padrão de
// getCategoryColorMap, pra resolver o avatar de cada linha em
// Transações sem uma query por transação.
export async function getCategoryIconMap(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, string | null>> {
  const { data } = await supabase
    .from("categories")
    .select("name, icon")
    .eq("household_id", householdId);

  return new Map((data ?? []).map((row) => [row.name, row.icon as string | null]));
}
