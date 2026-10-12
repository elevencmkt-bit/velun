-- Cartão de crédito.
--
-- Cartão é uma conta do tipo `credit_card`. Limite, dia de fechamento e
-- dia de vencimento já existiam desde a 0001 (sem uso até agora). Esta
-- migração acrescenta:
--   - de qual conta sai o pagamento da fatura;
--   - os 4 últimos dígitos (só pra reconhecer o cartão na tela);
--   - a cor do cartão desenhado.
--
-- A fatura não é guardada em tabela nenhuma: ela é calculada a partir
-- dos lançamentos do cartão e do dia de fechamento, como o saldo das
-- contas. Pagar a fatura é uma transferência da conta que paga pro
-- cartão — não conta como gasto de novo.

alter table accounts
  add column payment_account_id uuid references accounts (id) on delete set null,
  add column last_four text check (last_four ~ '^[0-9]{4}$'),
  add column card_color text check (card_color in ('ink', 'blue', 'green', 'coral', 'purple'));

alter table accounts
  add constraint accounts_statement_close_day_range check (statement_close_day between 1 and 31),
  add constraint accounts_payment_due_day_range check (payment_due_day between 1 and 31),
  add constraint accounts_credit_limit_positive check (credit_limit_cents is null or credit_limit_cents > 0),
  add constraint accounts_payment_account_not_self check (payment_account_id is null or payment_account_id <> id);
