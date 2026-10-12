-- Compra parcelada no cartão.
--
-- Uma compra em 6 vezes vira 6 lançamentos no cartão, um por mês, cada
-- um caindo na fatura do seu mês. Os seis ficam ligados pelo mesmo
-- `installment_group_id` e sabem qual parcela são ("3 de 6").
--
-- Cada parcela é gasto no mês dela — é assim que a fatura cobra e é
-- assim que o orçamento do mês sente.

alter table transactions
  add column installment_group_id uuid,
  add column installment_number smallint,
  add column installment_total smallint;

alter table transactions
  add constraint transactions_installment_shape check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (
      installment_group_id is not null
      and installment_total between 2 and 48
      and installment_number between 1 and installment_total
    )
  );

create index transactions_installment_group_idx on transactions (installment_group_id)
  where installment_group_id is not null;
