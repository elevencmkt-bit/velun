// Faturas de cartão de crédito, calculadas a partir dos lançamentos do
// cartão — nada disso é guardado no banco, igual o saldo das contas.
//
// O jeito de pensar é o do próprio banco: o cartão tem uma DÍVIDA que
// sobe a cada compra e desce a cada pagamento ou estorno. A fatura que
// fecha num dia é a dívida naquele dia. Paga é quando, depois do
// fechamento, entrou pagamento suficiente pra cobrir esse valor. O que
// não foi pago continua na dívida e aparece sozinho na fatura seguinte —
// é assim que pagamento parcial funciona, e os juros chegam como uma
// linha a mais na próxima fatura importada.

export type CardSettings = {
  /** Dia do mês em que a fatura fecha (1–31; meses curtos usam o último dia). */
  closeDay: number;
  /** Dia do mês em que a fatura vence. */
  dueDay: number;
  /** Saldo inicial da conta do cartão (negativo = dívida que já existia). */
  openingBalanceCents: number;
};

export type CardTransaction = {
  id: string;
  date: string;
  amount_cents: number;
  direction: "in" | "out";
  transfer_group_id: string | null;
  /** Parcela de compra parcelada: já ocupa o limite antes da data dela. */
  installment_group_id?: string | null;
};

export type StatementStatus = "open" | "closed" | "paid" | "overdue";

export type Statement = {
  /** Dia seguinte ao fechamento anterior. */
  start: string;
  /** Dia do fechamento. */
  closing: string;
  due: string;
  status: StatementStatus;
  /** Compras do período (sem pagamentos e sem estornos). */
  chargesCents: number;
  /** Estornos e créditos do período. */
  creditsCents: number;
  /** Valor da fatura: a dívida no dia do fechamento (nunca negativa). */
  totalCents: number;
  /** Pagamentos feitos depois do fechamento (contam primeiro pra fatura mais antiga em aberto). */
  paidCents: number;
  /** O que falta pagar desta fatura. */
  remainingCents: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Data com o dia "encaixado" no mês: dia 31 em fevereiro vira o último dia. */
export function clampedDate(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Fechamento da fatura em que cai uma compra feita em `date`. Compra no dia do fechamento ainda entra nela. */
export function closingFor(date: string, closeDay: number): string {
  const { year, monthIndex } = parts(date);
  const thisMonth = clampedDate(year, monthIndex, closeDay);
  return date <= thisMonth
    ? thisMonth
    : clampedDate(year, monthIndex + 1, closeDay);
}

export function previousClosing(closing: string, closeDay: number): string {
  const { year, monthIndex } = parts(closing);
  return clampedDate(year, monthIndex - 1, closeDay);
}

export function nextClosing(closing: string, closeDay: number): string {
  const { year, monthIndex } = parts(closing);
  return clampedDate(year, monthIndex + 1, closeDay);
}

/** Vencimento: o primeiro dia `dueDay` depois do fechamento. */
export function dueFor(closing: string, dueDay: number): string {
  const { year, monthIndex } = parts(closing);
  const sameMonth = clampedDate(year, monthIndex, dueDay);
  return sameMonth > closing
    ? sameMonth
    : clampedDate(year, monthIndex + 1, dueDay);
}

/**
 * Faturas do cartão, da mais antiga com movimento até a aberta (e a
 * seguinte, se já houver compra prevista nela). No máximo `limit`, as
 * mais recentes.
 */
export function buildStatements(
  transactions: CardTransaction[],
  settings: CardSettings,
  today: string,
  limit = 12,
): Statement[] {
  const { closeDay, dueDay } = settings;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const currentClosing = closingFor(today, closeDay);
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].date : today;
  const lastClosing = closingFor(lastDate > today ? lastDate : today, closeDay);
  const earliest =
    sorted.length > 0 ? closingFor(sorted[0].date, closeDay) : currentClosing;
  const firstClosing = earliest < currentClosing ? earliest : currentClosing;

  const closings: string[] = [];
  for (let c = firstClosing; c <= lastClosing; c = nextClosing(c, closeDay))
    closings.push(c);

  // Dívida acumulada até cada data: compra soma, pagamento e estorno
  // subtraem. O saldo inicial negativo da conta é dívida de antes.
  const debtUntil = (date: string) => {
    let debt = -settings.openingBalanceCents;
    for (const t of sorted) {
      if (t.date > date) break;
      debt += t.direction === "out" ? t.amount_cents : -t.amount_cents;
    }
    return debt;
  };

  const statements = closings.map((closing): Statement => {
    const start = nextDay(previousClosing(closing, closeDay));
    let charges = 0;
    let credits = 0;
    let paid = 0;
    for (const t of sorted) {
      if (t.date >= start && t.date <= closing && !t.transfer_group_id) {
        if (t.direction === "out") charges += t.amount_cents;
        else credits += t.amount_cents;
      }
      if (t.date > closing && t.direction === "in" && t.transfer_group_id) {
        paid += t.amount_cents;
      }
    }
    const total = Math.max(0, debtUntil(closing));
    const remaining = Math.max(0, total - paid);
    const due = dueFor(closing, dueDay);
    const status: StatementStatus =
      today <= closing
        ? "open"
        : remaining === 0
          ? "paid"
          : today > due
            ? "overdue"
            : "closed";
    return {
      start,
      closing,
      due,
      status,
      chargesCents: charges,
      creditsCents: credits,
      totalCents: total,
      paidCents: paid,
      remainingCents: remaining,
    };
  });

  return statements.slice(-limit);
}

/** Dívida de hoje no cartão (compras − pagamentos − estornos), nunca negativa. */
export function currentDebt(
  transactions: CardTransaction[],
  settings: CardSettings,
  today: string,
): number {
  let debt = -settings.openingBalanceCents;
  for (const t of transactions) {
    // Parcela futura já ocupa o limite: o banco bloqueia a compra inteira.
    if (t.date > today && !t.installment_group_id) continue;
    debt += t.direction === "out" ? t.amount_cents : -t.amount_cents;
  }
  return Math.max(0, debt);
}

export const CARD_COLORS: Record<
  string,
  { bg: string; fg: string; motif: string; label: string }
> = {
  ink: { bg: "#151821", fg: "#FFFFFF", motif: "#6C83FF", label: "Grafite" },
  blue: { bg: "#536DFE", fg: "#FFFFFF", motif: "#FFFFFF", label: "Azul Velun" },
  green: { bg: "#1FA982", fg: "#FFFFFF", motif: "#FFFFFF", label: "Verde" },
  coral: { bg: "#F0607A", fg: "#FFFFFF", motif: "#FFFFFF", label: "Coral" },
  purple: { bg: "#7C5CE0", fg: "#FFFFFF", motif: "#FFFFFF", label: "Roxo" },
};

export const STATUS_LABELS: Record<StatementStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Vencida",
};
