-- Em cartão, saldo inicial é dívida.
--
-- O formulário antigo de conta perguntava "saldo inicial" pra qualquer
-- tipo, e quem cadastrava um cartão digitava o que devia como número
-- positivo — que o app lia como crédito a favor. O formulário novo já
-- pergunta "quanto você deve" e grava negativo. Aqui:
--   1. os cartões cadastrados pelo formulário antigo viram dívida;
--   2. o banco passa a recusar cartão com saldo inicial positivo, pra
--      nenhum caminho antigo gravar do jeito errado de novo.

update accounts
set opening_balance_cents = -opening_balance_cents
where type = 'credit_card'
  and opening_balance_cents > 0;

alter table accounts
  add constraint accounts_card_opening_is_debt
  check (type <> 'credit_card' or opening_balance_cents <= 0);
