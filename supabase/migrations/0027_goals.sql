-- ---------------------------------------------------------------------------
-- Metas: juntar dinheiro, limite de gasto, quitar dívida
-- ---------------------------------------------------------------------------
--
-- Três tipos numa tabela só (`kind`):
--   save  — juntar `target_cents` até `target_date`. O progresso vem dos
--           depósitos na meta (`tracking = 'deposits'`) ou do saldo de uma
--           conta (`tracking = 'account'`).
--   limit — gastar até `target_cents` por mês na categoria `category_id`.
--           O gasto vem dos lançamentos; nada é guardado.
--   debt  — zerar uma dívida até `target_date`. `start_cents` é quanto se
--           devia ao criar; o que falta vem do saldo da conta (cartão) ou
--           de `start_cents` menos os pagamentos registrados.
--
-- De quem é, igual às contas: `owner_id` nulo = do casal (os dois veem e
-- mexem); com dono, só o dono mexe e a outra pessoa só vê se
-- `visibility = 'shared'`.
--
-- A tabela `goals` do começo do projeto (0001) nunca foi usada pelo app.
-- Ela sai e entra esta. Por garantia, a migração para se tiver alguma
-- linha lá — aí é olhar antes de apagar.

do $$
begin
  if exists (select 1 from goals) then
    raise exception 'A tabela goals antiga tem dados; confira antes de rodar esta migração.';
  end if;
end $$;

drop table goals;

create table goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  owner_id uuid references members (id) on delete cascade,
  visibility text not null default 'hidden' check (visibility in ('hidden', 'shared')),
  kind text not null check (kind in ('save', 'limit', 'debt')),
  name text not null check (length(trim(name)) between 1 and 80),
  target_cents bigint check (target_cents is null or target_cents > 0),
  target_date date,
  tracking text not null default 'deposits' check (tracking in ('deposits', 'account')),
  account_id uuid references accounts (id) on delete set null,
  category_id uuid references categories (id) on delete cascade,
  start_cents bigint not null default 0,
  is_archived boolean not null default false,
  created_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Cada tipo precisa do que usa.
  constraint goals_limit_needs_category check (kind <> 'limit' or (category_id is not null and target_cents is not null)),
  constraint goals_save_needs_target check (kind <> 'save' or target_cents is not null),
  constraint goals_account_tracking check (tracking <> 'account' or account_id is not null or kind = 'limit')
);

create index goals_household_idx on goals (household_id);

-- Valores guardados na meta (ou pagamentos da dívida, quando é manual).
-- Negativo = tirou da meta.
create table goal_deposits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  goal_id uuid not null references goals (id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  date date not null default current_date,
  note text,
  created_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index goal_deposits_goal_idx on goal_deposits (goal_id, date);

alter table goals enable row level security;
alter table goal_deposits enable row level security;

-- Ver: do casal, minhas, ou pessoais do outro que ele liberou — e, se a
-- meta segue uma conta, só quem enxerga a conta (o RLS de accounts vale
-- dentro da subquery: conta oculta esconde a meta junto).
-- Mexer: só do casal ou minhas. Meta do casal só segue conta do casal
-- (senão mostraria pra um o saldo da conta pessoal do outro); a minha
-- segue conta do casal ou minha. A categoria tem de ser da casa.
create policy goals_rw on goals
  for all
  using (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid() or visibility = 'shared')
    and (account_id is null or exists (select 1 from accounts a where a.id = account_id))
  )
  with check (
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
    and (account_id is null or exists (
      select 1 from accounts a
      where a.id = account_id and a.household_id = current_household_id()
        and (a.owner_id is null or (goals.owner_id is not null and a.owner_id = auth.uid()))
    ))
    and (category_id is null or exists (
      select 1 from categories c where c.id = category_id and c.household_id = current_household_id()
    ))
  );

-- Depósitos seguem a meta: vejo os das metas que vejo; registro só nas
-- que posso mexer (do casal ou minhas).
create policy goal_deposits_select on goal_deposits
  for select
  using (household_id = current_household_id() and exists (select 1 from goals g where g.id = goal_id));

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
    )
  );

grant select, insert, update, delete on goals, goal_deposits to authenticated;
