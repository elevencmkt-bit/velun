-- Convite pra o parceiro(a) entrar no mesmo household — token único,
-- expira em alguns dias, uso único. A aceitação (signup + entrada no
-- household) roda inteiramente pela service role no server, já que
-- quem aceita ainda não pertence a household nenhum e não passaria no
-- RLS normal (current_household_id() só enxerga quem já é membro).
create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references members (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references members (id)
);

create index household_invites_household_id_idx on household_invites (household_id);

alter table household_invites enable row level security;

create policy household_invites_select on household_invites
  for select using (household_id = current_household_id());

create policy household_invites_insert on household_invites
  for insert with check (household_id = current_household_id());

create policy household_invites_delete on household_invites
  for delete using (household_id = current_household_id());
