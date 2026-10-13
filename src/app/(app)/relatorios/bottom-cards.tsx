import { ArrowDownLeft, ArrowUpRight, Check, Equal, Plus, Sparkles, TrendingDown } from "lucide-react";
import type { CurrencyCode } from "@/lib/money";
import type { InsightPart, ReportInsight } from "@/lib/reports";
import { Money } from "@/components/money";
import { themedBg, themedFg } from "@/lib/theme-color";

function Parts({
  parts,
  currency,
  moneyClass = "font-semibold text-(--text-primary)",
}: {
  parts: InsightPart[];
  currency: CurrencyCode;
  moneyClass?: string;
}) {
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <Money key={i} cents={part.cents} currency={currency} className={moneyClass} />
        ),
      )}
    </>
  );
}

// Ícone de cada frase pelo que ela diz: entrou, saiu, igual, novidade.
function iconFor(item: ReportInsight["items"][number]) {
  const first = typeof item.parts[0] === "string" ? item.parts[0] : "";
  if (first.startsWith("Entrou")) return { Icon: ArrowDownLeft, bg: "#E9FBF2", fg: "#1A8A6D" };
  if (first.startsWith("Saiu"))
    return item.tone === "positive"
      ? { Icon: ArrowUpRight, bg: "#E9FBF2", fg: "#1A8A6D" }
      : { Icon: ArrowUpRight, bg: "#FFF4E5", fg: "#B54708" };
  if (first.includes("ficou igual")) return { Icon: Equal, bg: "#EEF1FF", fg: "#536DFE" };
  if (first.includes("primeira vez")) return { Icon: Plus, bg: "#F2F4F7", fg: "#475467" };
  return { Icon: Sparkles, bg: "#EEF1FF", fg: "#536DFE" };
}

/** Insight Velun: a frase do mês em destaque e até 4 comparações com o mês anterior. */
export function InsightVelunCard({
  insight,
  currency,
  subtitle,
}: {
  insight: ReportInsight;
  currency: CurrencyCode;
  subtitle: string;
}) {
  const warning = insight.tone === "warning";
  return (
    <article className="rounded-[20px] bg-(--bg-surface) p-5 shadow-(--shadow-card) md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--primary-light) text-(--primary)">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-card-title">Insight Velun</h2>
          <p className="text-[13px] text-(--text-muted)">{subtitle}</p>
        </div>
      </div>

      <div
        className="mt-4 flex items-start gap-3 rounded-[14px] px-4 py-3.5 text-[15px] leading-relaxed"
        style={warning ? { background: themedBg("#FFF6E5", "#F79009"), color: themedFg("#7A2E0E") } : { background: themedBg("#E9FBF2", "#27C499"), color: themedFg("#0B6E4F") }}
      >
        {warning ? (
          <TrendingDown className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <Check className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.4} />
        )}
        <p>
          <Parts parts={insight.headline} currency={currency} moneyClass="font-bold" />
        </p>
      </div>

      {insight.items.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3.5 md:grid-cols-2">
          {insight.items.map((item, i) => {
            const { Icon, bg: bg0, fg: fg0 } = iconFor(item);
            const bg = themedBg(bg0, fg0);
            const fg = themedFg(fg0);
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: bg, color: fg }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
                <p className="text-sm leading-relaxed text-(--text-secondary)">
                  <Parts parts={item.parts} currency={currency} />
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
