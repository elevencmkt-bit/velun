-- Conta do casal só sai com o aval dos dois.
--
-- Conta do casal é dos dois: excluir sozinho seria tirar do outro algo
-- que também é dele. Então, com mais de um membro na casa, quem quer
-- excluir PEDE, e o outro aprova (ou recusa) pelo sino. Conta pessoal
-- continua sendo do dono — ele exclui sem pedir.
--
-- A regra mora no banco, não na tela: a política de delete deixa de
-- aceitar conta do casal quando a casa tem mais de um membro, e o único
-- caminho passa a ser approve_account_deletion, que confere que quem
-- aprova não é quem pediu.

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  requested_by uuid not null references members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'declined')),
  decided_by uuid references members (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Um pedido aberto por conta.
create unique index account_deletion_requests_one_pending
  on account_deletion_requests (account_id) where status = 'pending';
create index account_deletion_requests_household_idx
  on account_deletion_requests (household_id, created_at desc);

alter table account_deletion_requests enable row level security;

-- Todo mundo da casa vê os pedidos (é assim que o outro fica sabendo).
-- Escrita só pelas funções abaixo.
create policy account_deletion_requests_select on account_deletion_requests
  for select using (household_id = current_household_id());

-- Delete direto: conta própria, ou conta do casal numa casa de um membro só.
drop policy accounts_delete on accounts;
create policy accounts_delete on accounts
  for delete
  using (
    household_id = current_household_id()
    and (
      owner_id = auth.uid()
      or (
        owner_id is null
        and (select count(*) from members m where m.household_id = current_household_id()) = 1
      )
    )
  );

-- Exclui a conta e as recorrências que lançariam nela. Só conta vazia:
-- com histórico, o caminho é arquivar.
create or replace function delete_empty_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from transactions where account_id = p_account_id) then
    raise exception 'A conta tem lançamentos. Arquive, ou apague os lançamentos antes.';
  end if;
  delete from recurrences where template->>'account_id' = p_account_id::text;
  delete from accounts where id = p_account_id;
end;
$$;
revoke all on function delete_empty_account(uuid) from public, anon, authenticated;

-- Pede pra excluir uma conta do casal. Com um membro só na casa, exclui
-- na hora. Devolve 'deleted' ou 'requested'.
create or replace function request_account_deletion(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_owner uuid;
  v_members int;
begin
  select owner_id into v_owner from accounts
    where id = p_account_id and household_id = v_household;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_owner is not null then
    raise exception 'Conta pessoal não precisa de pedido: o dono exclui direto.';
  end if;
  if exists (select 1 from transactions where account_id = p_account_id) then
    raise exception 'A conta tem lançamentos. Arquive, ou apague os lançamentos antes.';
  end if;

  select count(*) into v_members from members where household_id = v_household;
  if v_members <= 1 then
    perform delete_empty_account(p_account_id);
    return 'deleted';
  end if;

  if exists (select 1 from account_deletion_requests
             where account_id = p_account_id and status = 'pending') then
    raise exception 'Já tem um pedido aberto pra excluir essa conta.';
  end if;

  insert into account_deletion_requests (household_id, account_id, requested_by)
    values (v_household, p_account_id, auth.uid());
  return 'requested';
end;
$$;

-- Aprova o pedido de outra pessoa: aí sim a conta sai.
create or replace function approve_account_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r account_deletion_requests%rowtype;
begin
  select * into r from account_deletion_requests
    where id = p_request_id and household_id = current_household_id()
    for update;
  if not found or r.status <> 'pending' then
    raise exception 'Esse pedido não está mais aberto.';
  end if;
  if r.requested_by = auth.uid() then
    raise exception 'Quem pediu não pode aprovar o próprio pedido.';
  end if;
  perform delete_empty_account(r.account_id);
  -- O pedido sai junto com a conta (on delete cascade).
end;
$$;

-- Recusa (quem não pediu) ou cancela (quem pediu).
create or replace function decline_account_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r account_deletion_requests%rowtype;
begin
  select * into r from account_deletion_requests
    where id = p_request_id and household_id = current_household_id()
    for update;
  if not found or r.status <> 'pending' then
    raise exception 'Esse pedido não está mais aberto.';
  end if;
  if r.requested_by = auth.uid() then
    delete from account_deletion_requests where id = p_request_id;
  else
    update account_deletion_requests
      set status = 'declined', decided_by = auth.uid(), decided_at = now()
      where id = p_request_id;
  end if;
end;
$$;

grant execute on function request_account_deletion(uuid) to authenticated;
grant execute on function approve_account_deletion(uuid) to authenticated;
grant execute on function decline_account_deletion(uuid) to authenticated;
