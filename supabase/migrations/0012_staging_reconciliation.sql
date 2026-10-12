-- Cruzamento entre previsão e extrato.
--
-- O problema: uma recorrência cadastrada já grava os próximos
-- lançamentos como `pending` — uma previsão. Quando o extrato chega,
-- o mesmo dinheiro entra de novo como `cleared`, com o texto do banco.
-- Resultado: o mês conta duas vezes, e a previsão fica eternamente
-- "atrasada" porque nada nunca a quitou.
--
-- A previsão tem que ser SUBSTITUÍDA pelo fato, não somada a ele. Essas
-- colunas são o que permite perguntar isso na revisão em vez de adivinhar.

-- Previsão candidata a ser quitada por esta linha do extrato.
-- `on delete set null`: se a transação prevista for apagada por fora
-- antes de confirmar a importação, a linha do extrato continua válida e
-- simplesmente deixa de ter candidato.
-- A restrição é nomeada à mão porque a tela usa esse nome pra pedir a
-- previsão junto da linha do extrato numa consulta só. Deixar o
-- Postgres nomear funcionaria hoje e quebraria no dia que o nome mudar.
alter table staged_transactions
  add column match_transaction_id uuid;

alter table staged_transactions
  add constraint staged_transactions_match_transaction_id_fkey
  foreign key (match_transaction_id) references transactions (id) on delete set null;

-- Resposta de quem revisou. Só tem efeito quando há candidato.
-- Começa `true`: quando o cruzamento acerta — mesma conta, mesmo valor,
-- data colada — juntar é quase sempre o que se quer, e separar é um
-- clique. O contrário faria o usuário clicar em tudo pra consertar o
-- que o sistema já sabia.
alter table staged_transactions
  add column merge_accepted boolean not null default true;

-- Estado da previsão ANTES da junção, pra o desfazer poder restaurar.
--
-- Sem isso o desfazer fica impossível de fazer certo: a junção
-- sobrescreve data, valor e status da transação prevista, e a
-- importação não teria como saber o que havia lá antes. Apagar a linha
-- no desfazer seria pior ainda — ela existia antes da importação e não
-- é dela pra apagar.
alter table staged_transactions
  add column match_previous jsonb;

create index staged_transactions_match_transaction_id_idx
  on staged_transactions (match_transaction_id);
