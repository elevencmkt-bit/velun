-- Fase 0: schema completo com RLS por household_id.
-- Referência: spec-dashboard-financeiro.md, seção 5.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- households / members
-- ---------------------------------------------------------------------------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  display_name text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create index members_household_id_idx on members (household_id);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create type account_type as enum ('checking', 'savings', 'credit_card', 'cash', 'investment');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  type account_type not null,
  institution text,
  opening_balance_cents bigint not null default 0,
  credit_limit_cents bigint,
  statement_close_day smallint,
  payment_due_day smallint,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index accounts_household_id_idx on accounts (household_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create type category_kind as enum ('income', 'expense');

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  kind category_kind not null,
  parent_id uuid references categories (id) on delete set null,
  color text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index categories_household_id_idx on categories (household_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create type transaction_direction as enum ('in', 'out');
create type transaction_status as enum ('pending', 'cleared');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete restrict,
  category_id uuid references categories (id) on delete set null,
  date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  direction transaction_direction not null,
  description text not null,
  notes text,
  status transaction_status not null default 'cleared',
  transfer_group_id uuid,
  recurrence_id uuid,
  import_id uuid,
  fingerprint text not null,
  created_by uuid not null references members (id),
  created_at timestamptz not null default now()
);

create index transactions_household_id_idx on transactions (household_id);
create index transactions_account_id_idx on transactions (account_id);
create index transactions_date_idx on transactions (household_id, date);
create index transactions_fingerprint_idx on transactions (household_id, fingerprint);
create index transactions_status_idx on transactions (household_id, status);

-- ---------------------------------------------------------------------------
-- imports / staged_transactions
-- ---------------------------------------------------------------------------

create type import_status as enum ('processing', 'review', 'confirmed', 'failed');

create table imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  file_path text not null,
  file_type text not null,
  status import_status not null default 'processing',
  statement_start date,
  statement_end date,
  closing_balance_cents bigint,
  extracted_sum_cents bigint,
  balance_matches boolean,
  error_message text,
  created_by uuid not null references members (id),
  created_at timestamptz not null default now()
);

create index imports_household_id_idx on imports (household_id);

alter table transactions
  add constraint transactions_import_id_fkey
  foreign key (import_id) references imports (id) on delete set null;

create type category_source as enum ('rule', 'model', 'manual', 'none');
create type dup_status as enum ('none', 'possible_duplicate', 'duplicate');

create table staged_transactions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports (id) on delete cascade,
  date date not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  direction transaction_direction not null,
  suggested_category_id uuid references categories (id) on delete set null,
  category_source category_source not null default 'none',
  fingerprint text not null,
  dup_status dup_status not null default 'none',
  is_included boolean not null default true
);

create index staged_transactions_import_id_idx on staged_transactions (import_id);

-- ---------------------------------------------------------------------------
-- category_rules / import_profiles
-- ---------------------------------------------------------------------------

create type rule_match_type as enum ('exact', 'contains');

create table category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  match_type rule_match_type not null,
  pattern text not null,
  category_id uuid not null references categories (id) on delete cascade,
  hit_count integer not null default 0,
  created_by uuid not null references members (id),
  created_at timestamptz not null default now()
);

create index category_rules_household_id_idx on category_rules (household_id);

create table import_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  institution text not null,
  file_type text not null,
  column_mapping jsonb not null,
  date_format text not null,
  created_at timestamptz not null default now()
);

create index import_profiles_household_id_idx on import_profiles (household_id);

-- ---------------------------------------------------------------------------
-- recurrences
-- ---------------------------------------------------------------------------

create type recurrence_frequency as enum ('monthly', 'weekly', 'yearly');

create table recurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  template jsonb not null,
  frequency recurrence_frequency not null,
  day_of_month smallint,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index recurrences_household_id_idx on recurrences (household_id);

alter table transactions
  add constraint transactions_recurrence_id_fkey
  foreign key (recurrence_id) references recurrences (id) on delete set null;

-- ---------------------------------------------------------------------------
-- v2 tables (schema pronto, telas fora da v1)
-- ---------------------------------------------------------------------------

create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  month date not null,
  limit_cents bigint not null,
  created_at timestamptz not null default now()
);

create index budgets_household_id_idx on budgets (household_id);

create table goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  target_cents bigint not null,
  target_date date,
  linked_account_id uuid references accounts (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index goals_household_id_idx on goals (household_id);

create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  date date not null,
  balance_cents bigint not null,
  created_at timestamptz not null default now()
);

create index net_worth_snapshots_household_id_idx on net_worth_snapshots (household_id);

-- ---------------------------------------------------------------------------
-- RLS: cada tabela é isolada por household_id, checado contra a
-- membership do usuário autenticado (via tabela members).
-- ---------------------------------------------------------------------------

create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from members where id = auth.uid()
$$;

alter table households enable row level security;
alter table members enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table imports enable row level security;
alter table staged_transactions enable row level security;
alter table category_rules enable row level security;
alter table import_profiles enable row level security;
alter table recurrences enable row level security;
alter table budgets enable row level security;
alter table goals enable row level security;
alter table net_worth_snapshots enable row level security;

create policy household_select on households
  for select using (id = current_household_id());

create policy members_select on members
  for select using (household_id = current_household_id());

create policy accounts_all on accounts
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy categories_all on categories
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy transactions_all on transactions
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy imports_all on imports
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy staged_transactions_all on staged_transactions
  for all using (
    import_id in (select id from imports where household_id = current_household_id())
  )
  with check (
    import_id in (select id from imports where household_id = current_household_id())
  );

create policy category_rules_all on category_rules
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy import_profiles_all on import_profiles
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy recurrences_all on recurrences
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy budgets_all on budgets
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy goals_all on goals
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

create policy net_worth_snapshots_all on net_worth_snapshots
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());
