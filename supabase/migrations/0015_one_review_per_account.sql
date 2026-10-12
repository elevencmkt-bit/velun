-- Uma importação em revisão por conta.
--
-- Na importação de setembro o mesmo PDF entrou duas vezes antes de
-- qualquer confirmação. A tela mostra só a revisão mais recente, então
-- as duas pareciam uma: confirmar uma fazia a outra aparecer, idêntica,
-- no lugar. O clique parecia não ter feito nada, o segundo confirmava a
-- outra, e o mês ficou em dobro.
--
-- A tela já recusa com uma mensagem clara. Esta regra é a garantia: vale
-- mesmo que duas importações cheguem ao banco no mesmo instante, que é o
-- caso que nenhuma checagem feita antes de gravar consegue cobrir.

create unique index imports_one_review_per_account
  on imports (account_id)
  where status = 'review';
