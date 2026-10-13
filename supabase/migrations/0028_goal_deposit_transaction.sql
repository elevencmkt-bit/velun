-- ---------------------------------------------------------------------------
-- Metas: vincular um lançamento que já existe a um depósito/pagamento
-- ---------------------------------------------------------------------------
--
-- Pagou a parcela do empréstimo pela Regions? Em vez de digitar de novo
-- na meta, escolhe o lançamento. O valor e a data passam a vir dele; se o
-- lançamento for apagado, o registro na meta sai junto.
--
-- Privacidade, a mesma regra das metas que seguem conta: meta do casal só
-- vincula lançamento de conta do casal (a outra pessoa veria o valor);
-- meta minha vincula lançamento de conta do casal ou minha.

alter table goal_deposits
  add column transaction_id uuid references transactions (id) on delete cascade;

-- O mesmo lançamento não entra duas vezes na mesma meta.
create unique index goal_deposits_goal_transaction_idx
  on goal_deposits (goal_id, transaction_id)
  where transaction_id is not null;

drop policy goal_deposits_write on goal_deposits;

create policy goal_deposits_write on goal_deposits
  for all
  using (
    household_id = current_household_id()
    and exists (select 1 from goals g where g.id = goal_id and (g.owner_id is null or g.owner_id = auth.uid()))
  )
  with check (
    household_id = current_household_id()
    and exists (
      select 1 from goals g
      where g.id = goal_id and g.household_id = current_household_id()
        and (g.owner_id is null or g.owner_id = auth.uid())
        and (
          transaction_id is null
          or exists (
            select 1 from transactions t
            join accounts a on a.id = t.account_id
            where t.id = transaction_id and t.household_id = current_household_id()
              and (a.owner_id is null or (g.owner_id is not null and a.owner_id = auth.uid()))
          )
        )
    )
  );
