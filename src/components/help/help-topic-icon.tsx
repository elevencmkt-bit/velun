import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  Flag,
  PieChart,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { HelpTopicIcon as IconKey } from "@/lib/help/content";

const ICONS: Record<IconKey, { icon: LucideIcon; tone: string }> = {
  start: { icon: Sparkles, tone: "bg-(--primary-soft) text-(--primary)" },
  couple: { icon: Users, tone: "bg-(--purple-soft) text-(--purple)" },
  transactions: { icon: ArrowLeftRight, tone: "bg-(--income-soft) text-(--income-dark)" },
  import: { icon: Upload, tone: "bg-(--info-soft) text-(--info)" },
  cards: { icon: CreditCard, tone: "bg-(--warning-soft) text-(--warning-dark)" },
  due: { icon: CalendarClock, tone: "bg-(--primary-soft) text-(--primary)" },
  flow: { icon: TrendingUp, tone: "bg-(--income-soft) text-(--income-dark)" },
  reports: { icon: PieChart, tone: "bg-(--expense-soft) text-(--expense-dark)" },
  goals: { icon: Target, tone: "bg-(--income-soft) text-(--income-dark)" },
  settings: { icon: Settings, tone: "bg-(--bg-hover) text-(--text-secondary)" },
};

/** Ícone do assunto num quadradinho colorido. */
export function HelpTopicIcon({ icon, size = "md" }: { icon: IconKey; size?: "sm" | "md" }) {
  const { icon: Icon, tone } = ICONS[icon] ?? { icon: Flag, tone: "bg-(--bg-hover) text-(--text-secondary)" };
  const box = size === "sm" ? "h-8 w-8 rounded-[10px]" : "h-11 w-11 rounded-[13px]";
  const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center ${box} ${tone}`}>
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}
