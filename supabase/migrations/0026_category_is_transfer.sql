-- ---------------------------------------------------------------------------
-- Categoria de movimentação entre contas
-- ---------------------------------------------------------------------------
--
-- Saque na Nomad que vira depósito em espécie na Regions: o mesmo dinheiro
-- mudando de conta, mas os dois lados vêm de extratos diferentes e os
-- valores não casam um a um (3 saques de $400 → 2 depósitos de $600).
-- Não dá pra ligar em par como a transferência lançada pelo app.
--
-- Uma categoria marcada aqui serve pros dois lados, entrada e saída, e
-- fica fora de receitas e despesas (Relatórios, Dashboard, PDF). O saldo
-- de cada conta não muda: continua somando tudo.

alter table categories add column is_transfer boolean not null default false;
