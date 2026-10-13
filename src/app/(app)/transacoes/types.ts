export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  notes: string | null;
  /** Texto como veio do banco, em lançamento importado. */
  bank_description: string | null;
  amount_cents: number;
  direction: "in" | "out";
  status: "pending" | "cleared";
  is_overdue: boolean;
  import_id: string | null;
  transfer_group_id: string | null;
  recurrence_id: string | null;
  /** "3 de 6" em compra parcelada. */
  installment?: string | null;
  account_id: string;
  category_id: string | null;
  account_name: string;
  category_name: string | null;
  creator_name: string | null;
  /**
   * Se quem está vendo pode mexer neste lançamento: conta do casal ou
   * própria. Lançamento da conta pessoal "aberta" do outro aparece, mas
   * só pra leitura — o banco recusa a alteração (0016), e recusa sem
   * erro, então a tela não pode oferecer o botão.
   */
  can_edit: boolean;
};

export type CategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense";
  is_transfer?: boolean;
  color?: string | null;
  icon?: string | null;
};
export type AccountOption = { id: string; name: string; type?: string; institution?: string | null };
export type MemberOption = { id: string; name: string };

/** Situação pra abas: atrasado (pendente que passou), pendente, confirmado. */
export type StatusKey = "late" | "pending" | "confirmed";

// Resumo do período: só o que já foi confirmado. O que ainda está
// pendente (recorrências futuras, contas a vencer) aparece à parte.
export type TransactionsSummary = {
  inCents: number;
  outCents: number;
  inCount: number;
  outCount: number;
  pendingInCents: number;
  pendingOutCents: number;
  pendingInCount: number;
  pendingOutCount: number;
};
