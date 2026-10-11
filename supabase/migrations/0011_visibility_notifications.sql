-- Fase C da privacidade seletiva: mudanças de nível nunca em silêncio.
--
-- A regra 2 do princípio: "o dono pode fechar ou abrir uma conta a
-- qualquer momento, e a visão do outro membro passa a refletir o estado
-- atual — mas nunca em silêncio". É isso que impede o recurso de virar
-- ferramenta de ocultação, e é o que torna a privacidade confiável em vez
-- de só conveniente.

-- ---------------------------------------------------------------------------
-- log de mudanças de visibilidade
-- ---------------------------------------------------------------------------

create table account_visibility_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  changed_by uuid not null references members (id),
  from_owner_id uuid references members (id),
  to_owner_id uuid references members (id),
  from_visibility account_visibility not null,
  to_visibility account_visibility not null,
  created_at timestamptz not null default now()
);

create index avc_household_created_idx
  on account_visibility_changes (household_id, created_at desc);

-- O nome da conta é copiado pro log? Não. Se o dono renomear a conta
-- depois, a notificação deve falar da conta como ela é agora — por isso
-- a referência, e não uma cópia do nome.

-- ---------------------------------------------------------------------------
-- trigger: escrito pelo banco, não pela aplicação
-- ---------------------------------------------------------------------------

-- No banco, e não na server action, de propósito: assim a regra vale por
-- qualquer caminho que altere a conta — outra tela, um script, o SQL
-- Editor. Uma promessa de produto que depende de alguém lembrar de
-- chamar uma função não é uma promessa.
create or replace function log_account_visibility_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trocar o dono também muda o que o outro vê (conta do casal virando
  -- pessoal esconde tudo), então conta como mudança de visibilidade.
  if new.visibility is distinct from old.visibility
     or new.owner_id is distinct from old.owner_id then
    insert into account_visibility_changes (
      household_id, account_id, changed_by,
      from_owner_id, to_owner_id,
      from_visibility, to_visibility
    ) values (
      new.household_id, new.id, auth.uid(),
      old.owner_id, new.owner_id,
      old.visibility, new.visibility
    );
  end if;
  return new;
end;
$$;

create trigger accounts_log_visibility_change
  after update on accounts
  for each row
  execute function log_account_visibility_change();

-- Criar uma conta pessoal já fechada não gera log: não havia nada visível
-- antes, então não há nada que tenha deixado de ser visto.

alter table account_visibility_changes enable row level security;

-- Só leitura pelo household. A escrita é exclusiva do trigger, que roda
-- como security definer — ninguém insere, edita ou apaga uma entrada do
-- log pelo app, o que é o ponto de ele existir.
create policy avc_select on account_visibility_changes
  for select using (household_id = current_household_id());

-- ---------------------------------------------------------------------------
-- estado de "já vi" do sino
-- ---------------------------------------------------------------------------

alter table members
  add column notifications_seen_at timestamptz;

comment on column members.notifications_seen_at is
  'Última vez que o membro abriu o sino. Null = nunca abriu.';

-- ---------------------------------------------------------------------------
-- desvínculo do painel sem perda de histórico
-- ---------------------------------------------------------------------------

-- `members.id` referencia auth.users com on delete cascade, e
-- `transactions.created_by` referencia members. Apagar um membro apagaria
-- em cascata os lançamentos que ele criou — inclusive os das contas
-- conjuntas, que são do casal, não da pessoa.
--
-- A coluna abaixo deixa a saída ser uma mudança de estado em vez de um
-- delete. A tela de remover membro ainda não existe; isto é a fundação
-- que impede que ela seja construída de um jeito destrutivo.
alter table members
  add column removed_at timestamptz;

create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from members
  where id = auth.uid() and removed_at is null
$$;
