import { Wallet } from "lucide-react";
import { ACCOUNT_TYPE_ICONS } from "@/lib/account-types";
import { themedPair } from "@/lib/theme-color";

// Bolinha de cada conta. Com instituição preenchida, mostra as iniciais
// dela numa cor fixa por banco — o mesmo banco tem sempre a mesma cor, e
// dá pra bater o olho e saber de onde é a conta. Sem instituição, o ícone
// do tipo (carteira, cartão, investimento).

const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#E7EBFF", fg: "#4257CB" },
  { bg: "#DFF9F0", fg: "#1A8A6D" },
  { bg: "#FFF1DB", fg: "#B26A00" },
  { bg: "#F3E8FF", fg: "#7C3AED" },
  { bg: "#FFE3E8", fg: "#C22B44" },
  { bg: "#E0F2FE", fg: "#0369A1" },
  { bg: "#ECFCCB", fg: "#4D7C0F" },
];

function colorFor(key: string) {
  let hash = 0;
  for (const ch of key.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(bank|banco|de|do|da|the|of|inc|llc|na)$/i.test(w));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function AccountAvatar({
  institution,
  type,
  size = 36,
}: {
  institution: string | null;
  type: string;
  size?: number;
}) {
  const label = institution?.trim();
  if (label) {
    const color = themedPair(colorFor(label));
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight"
        style={{
          width: size,
          height: size,
          backgroundColor: color.bg,
          color: color.fg,
          fontSize: Math.round(size * 0.36),
        }}
      >
        {initials(label)}
      </div>
    );
  }

  const Icon = ACCOUNT_TYPE_ICONS[type] ?? Wallet;
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: "var(--badge-purple-bg)" }}
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45, color: "var(--badge-purple-fg)" }} />
    </div>
  );
}
