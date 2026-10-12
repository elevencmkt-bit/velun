-- ---------------------------------------------------------------------------
-- Categoria lembrada por estabelecimento
-- ---------------------------------------------------------------------------
--
-- Pôs Publix em Mercado uma vez: os outros Publix sem categoria vão
-- junto, e a próxima importação já chega com Mercado marcado.
--
-- Mesma chave do merchant_names (o nome limpo automático, normalizado) e
-- mesmo escopo: por PESSOA, não por casa. O que alguém ensina com a conta
-- pessoal não vira pista pro outro de onde essa pessoa compra.
--
-- A direção faz parte da chave: a compra na Amazon é "Compras", o
-- reembolso da Amazon é outra coisa.

create table merchant_categories (
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  bank_key text not null,
  direction transaction_direction not null,
  category_id uuid not null references categories (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (member_id, bank_key, direction)
);

alter table merchant_categories enable row level security;

create policy merchant_categories_own on merchant_categories
  for all
  using (household_id = current_household_id() and member_id = auth.uid())
  with check (
    household_id = current_household_id()
    and member_id = auth.uid()
    and exists (
      select 1 from categories c
      where c.id = category_id and c.household_id = current_household_id()
    )
  );

grant select, insert, update, delete on merchant_categories to authenticated;
