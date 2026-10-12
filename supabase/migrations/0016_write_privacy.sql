-- Ver é uma coisa; mexer é outra.
--
-- A 0010 fez a privacidade por conta com uma política só por tabela
-- (`for all`). Nela, o `using` — que vale pra LER, mas também pra ALTERAR
-- e APAGAR — era a condição de visibilidade. O `with check` restrito só
-- protegia o que se CRIA ou o estado DEPOIS de alterar.
--
-- Testado, como a esposa, contra a conta pessoal do Levi marcada como
-- "aberta" (ela vê tudo):
--   1. apagava lançamento dele — `delete` só confere o `using`;
--   2. puxava lançamento dele pra conta dela — o `using` deixava mexer
--      na linha, e o `with check` aprovava porque o destino era dela;
--   3. virava dona da conta dele — mesmo caminho, com `owner_id`.
-- A tela não tem botão pra nada disso, mas a promessa do produto é que
-- a proteção esteja no banco, não na tela.
--
-- Daqui em diante, em toda tabela com dado por conta:
--   - LER segue a visibilidade (a regra da 0010, sem mudança);
--   - CRIAR, ALTERAR e APAGAR só em conta do casal ou na própria — nos
--     dois lados: a linha que se mexe e a linha como fica depois.
--
-- "Aberta" (`shared`) continua querendo dizer: o outro VÊ tudo. Não quer
-- dizer que o outro pode mexer.


-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------

drop policy accounts_rw on accounts;

create policy accounts_select on accounts
  for select
  using (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid() or visibility <> 'hidden')
  );

create policy accounts_insert on accounts
  for insert
  with check (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

-- Alterar: só conta do casal ou a própria, e continua sendo do casal ou
-- própria depois. Ninguém se torna dono da conta do outro nem entrega a
-- própria conta pro outro.
create policy accounts_update on accounts
  for update
  using (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  )
  with check (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

create policy accounts_delete on accounts
  for delete
  using (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- Lançamentos
-- ---------------------------------------------------------------------------
--
-- As subconsultas em `accounts` passam pelo RLS de `accounts`: "contas
-- que vejo" é a política de leitura acima; "contas em que mexo" filtra
-- pelo dono.

drop policy transactions_rw on transactions;

create policy transactions_select on transactions
  for select
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts)
  );

create policy transactions_insert on transactions
  for insert
  with check (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  );

create policy transactions_update on transactions
  for update
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  )
  with check (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  );

create policy transactions_delete on transactions
  for delete
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- Recorrências (a conta mora em `template ->> 'account_id'`)
-- ---------------------------------------------------------------------------

drop policy recurrences_rw on recurrences;

create policy recurrences_select on recurrences
  for select
  using (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in (select id from accounts)
  );

create policy recurrences_insert on recurrences
  for insert
  with check (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in
      (select id from accounts where owner_id is null or owner_id = auth.uid())
  );

create policy recurrences_update on recurrences
  for update
  using (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in
      (select id from accounts where owner_id is null or owner_id = auth.uid())
  )
  with check (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in
      (select id from accounts where owner_id is null or owner_id = auth.uid())
  );

create policy recurrences_delete on recurrences
  for delete
  using (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in
      (select id from accounts where owner_id is null or owner_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- Histórico de patrimônio e metas (a 0014 repetiu o mesmo padrão)
-- ---------------------------------------------------------------------------

drop policy net_worth_snapshots_rw on net_worth_snapshots;

create policy net_worth_snapshots_select on net_worth_snapshots
  for select
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts)
  );

create policy net_worth_snapshots_write on net_worth_snapshots
  for all
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  )
  with check (
    household_id = current_household_id()
    and account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
  );

drop policy goals_rw on goals;

create policy goals_select on goals
  for select
  using (
    household_id = current_household_id()
    and (linked_account_id is null or linked_account_id in (select id from accounts))
  );

create policy goals_write on goals
  for all
  using (
    household_id = current_household_id()
    and (
      linked_account_id is null
      or linked_account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
    )
  )
  with check (
    household_id = current_household_id()
    and (
      linked_account_id is null
      or linked_account_id in (select id from accounts where owner_id is null or owner_id = auth.uid())
    )
  );
-- Políticas permissivas somam com OU: `goals_write` vale também pra
-- leitura, mas só libera o que `goals_select` já libera. Idem no
-- histórico de patrimônio.


-- ---------------------------------------------------------------------------
-- Membros: quais campos cada um pode mudar no próprio cadastro
-- ---------------------------------------------------------------------------
--
-- Proteção extra, não conserto: testado, os dois abusos que preocupavam
-- já eram barrados. Um membro removido não enxerga a própria linha (a
-- leitura depende de `current_household_id()`, que ignora removidos),
-- então não consegue apagar a própria remoção; e trocar `household_id`
-- também não passava.
--
-- Mesmo assim, o certo é o banco dizer explicitamente o que cada um pode
-- mudar no próprio cadastro, em vez de isso depender de como as regras
-- de leitura se combinam. O app só muda nome, foto, cor e "notificações
-- vistas" com a sessão do usuário; entrar numa casa e remover alguém
-- passam pelo servidor com a chave de administrador, que não depende
-- disto.

revoke update on members from anon, authenticated;
grant update (display_name, avatar_url, color, notifications_seen_at) on members to authenticated;
