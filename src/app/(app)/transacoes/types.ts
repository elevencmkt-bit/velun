export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  notes: string | null;
  amount_cents: number;
  direction: "in" | "out";
  status: "pending" | "cleared";
  import_id: string | null;
  category_id: string | null;
  account_name: string;
  category_name: string | null;
  creator_name: string | null;
};

export type CategoryOption = { id: string; name: string; kind: "income" | "expense" };
export type AccountOption = { id: string; name: string };
export type MemberOption = { id: string; name: string };
