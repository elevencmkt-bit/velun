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

// Ícone por categoria (avatar colorido nas linhas de Transações) —
// casamento por palavra-chave no nome da categoria, já que categorias
// são livres/customizadas pelo usuário, não um enum fixo. Sem match,
// cai no fallback genérico por tipo (entrada/despesa).
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

export function getCategoryIcon(categoryName: string | null, direction: "in" | "out"): LucideIcon {
  if (categoryName) {
    const normalized = normalize(categoryName);
    for (const [keywords, icon] of KEYWORD_ICONS) {
      if (keywords.some((k) => normalized.includes(normalize(k)))) return icon;
    }
  }
  return direction === "in" ? Banknote : Tag;
}
