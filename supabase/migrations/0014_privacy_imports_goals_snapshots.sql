-- Privacidade por conta nas tabelas que a 0010 esqueceu.
--
-- A 0010 trocou a regra "todo mundo da casa vê tudo" pela privacidade
-- por conta em `accounts`, `transactions` e `recurrences`. As
-- importações ficaram de fora e continuaram com a regra antiga.
--
-- Consequência, testada: com a conta pessoal do Levi marcada como
-- OCULTA, a esposa não via a conta — correto — mas via a importação em
-- revisão: nome do arquivo e cada linha do extrato, com descrição e
-- valor. Na tela, abrir /importar enquanto o outro revisa um extrato
-- pessoal mostrava a revisão inteira. E ela conseguia descartar a
-- importação dele, porque a regra de escrita também era só "mesma casa".
--
-- Metas e histórico de patrimônio ainda não têm tela, mas guardam dado
-- por conta (o histórico guarda SALDO por conta). Entram aqui antes de
-- terem dado, pra a tela nascer já protegida.


-- ---------------------------------------------------------------------------
-- Importações e staging
-- ---------------------------------------------------------------------------
--
-- Importar é o fluxo do DONO da conta: só faz sentido em conta que se
-- pode escrever — a do casal ou a própria. É a mesma condição do
-- `with check` de `transactions`, então quem não pode confirmar uma
-- importação também não a enxerga.
--
-- Isso vale mesmo quando a conta do outro está como "compartilhada": ele
-- vê os lançamentos depois de confirmados, como qualquer lançamento da
-- conta. O que fica privado é a revisão — linhas desmarcadas,
-- categorias trocadas, o rascunho.

drop policy imports_all on imports;

create policy imports_rw on imports
  for all
  using (
    household_id = current_household_id()
    and account_id in (
      select id from accounts where owner_id is null or owner_id = auth.uid()
    )
  )
  with check (
    household_id = current_household_id()
    and account_id in (
      select id from accounts where owner_id is null or owner_id = auth.uid()
    )
  );

-- O staging delega pra `imports`: a subconsulta já passa pelo RLS acima,
-- então só enxerga linha de importação que o usuário enxerga.
drop policy staged_transactions_all on staged_transactions;

create policy staged_transactions_rw on staged_transactions
  for all
  using (import_id in (select id from imports))
  with check (import_id in (select id from imports));


-- ---------------------------------------------------------------------------
-- Histórico de patrimônio
-- ---------------------------------------------------------------------------
--
-- Cada linha é o saldo de uma conta numa data. Saldo é exatamente o que
-- o nível `balance_only` permite mostrar, então a leitura segue a
-- visibilidade da conta: delega pra `accounts`, cujo RLS já esconde as
-- ocultas. Gravar só em conta própria ou do casal.

drop policy if exists net_worth_snapshots_all on net_worth_snapshots;

create policy net_worth_snapshots_rw on net_worth_snapshots
  for all
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts)
  )
  with check (
    household_id = current_household_id()
    and account_id in (
      select id from accounts where owner_id is null or owner_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------------
--
-- Meta sem conta vinculada é da casa. Meta vinculada a conta segue a
-- conta: some se a conta é oculta pra quem está vendo.

drop policy if exists goals_all on goals;

create policy goals_rw on goals
  for all
  using (
    household_id = current_household_id()
    and (linked_account_id is null or linked_account_id in (select id from accounts))
  )
  with check (
    household_id = current_household_id()
    and (
      linked_account_id is null
      or linked_account_id in (
        select id from accounts where owner_id is null or owner_id = auth.uid()
      )
    )
  );
