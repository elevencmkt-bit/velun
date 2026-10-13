-- ---------------------------------------------------------------------------
-- Metas: transferência mensal programada
-- ---------------------------------------------------------------------------
--
-- Meta que segue o saldo de uma conta (ex.: poupança) pode programar
-- "todo dia 5, $500 da Regions pra poupança". Isso vira transferências
-- PENDENTES de verdade (aparecem em Transações, A vencer e no Fluxo de
-- caixa); confirmadas, o saldo da conta sobe e a meta anda sozinha.
--
-- Aqui fica só o plano, pra mostrar e pra cancelar:
--   { "from_account_id", "amount_cents", "day", "groups": [transfer_group_id…] }

alter table goals add column schedule jsonb;
