-- Nome limpo na lista, texto do banco guardado à parte.
--
-- A importação passa a mostrar "Fxreplay" em vez de "Card Purchase
-- Fxreplay 5817 Oklahoma City OK 73103 9889". O texto do banco não some:
-- fica em `bank_description`, no próprio lançamento.
--
-- Isso também conserta uma fragilidade antiga: a impressão digital (o
-- que impede importar a mesma linha duas vezes) era recalculada a partir
-- da descrição sempre que alguém editava o lançamento. Renomear um
-- lançamento importado fazia o mesmo extrato, importado de novo, entrar
-- em dobro. Daqui em diante a impressão de um lançamento que veio do
-- banco é sempre calculada sobre o texto do banco.


-- ---------------------------------------------------------------------------
-- Colunas
-- ---------------------------------------------------------------------------

alter table staged_transactions add column bank_description text;
alter table transactions add column bank_description text;


-- ---------------------------------------------------------------------------
-- Nomes que cada pessoa escolheu pra cada estabelecimento
-- ---------------------------------------------------------------------------
--
-- Renomeou "Facebook" pra "Anúncios Facebook" uma vez, a próxima
-- importação já vem com o nome novo. É por pessoa, não por casa: o nome
-- que alguém dá a um gasto da conta pessoal não aparece pro outro.

create table merchant_names (
  household_id uuid not null references households (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  -- Nome limpo automático, normalizado (minúsculas, só letras e números).
  bank_key text not null,
  name text not null check (length(btrim(name)) > 0),
  updated_at timestamptz not null default now(),
  primary key (member_id, bank_key)
);

alter table merchant_names enable row level security;

create policy merchant_names_own on merchant_names
  for all
  using (household_id = current_household_id() and member_id = auth.uid())
  with check (household_id = current_household_id() and member_id = auth.uid());

grant select, insert, update, delete on merchant_names to authenticated;


-- ---------------------------------------------------------------------------
-- O que já foi importado
-- ---------------------------------------------------------------------------
--
-- Lançamento importado e nunca editado: a descrição atual É o texto do
-- banco. Só copia quando a impressão digital confere, que é a prova de
-- que ninguém mexeu.

-- [preenche-antigos:início] (os testes rodam este trecho de novo)

update transactions
set bank_description = description
where import_id is not null
  and bank_description is null
  and fingerprint = transaction_fingerprint(account_id, date, amount_cents, description);

-- Previsão quitada pela importação: o texto do banco foi parar na última
-- linha da observação. Move de lá pra coluna, de novo só quando a
-- impressão digital confere com essa linha.
with merged as (
  select id,
         lines,
         lines[array_length(lines, 1)] as bank_text
  from (
    select id, regexp_split_to_array(notes, E'\n') as lines
    from transactions
    where import_id is not null
      and bank_description is null
      and notes is not null
  ) t
)
update transactions t
set bank_description = m.bank_text,
    notes = nullif(array_to_string(m.lines[1:array_length(m.lines, 1) - 1], E'\n'), '')
from merged m
where t.id = m.id
  and t.fingerprint = transaction_fingerprint(t.account_id, t.date, t.amount_cents, m.bank_text);
-- [preenche-antigos:fim]


-- ---------------------------------------------------------------------------
-- Confirmar: grava o texto do banco na coluna, não mais na observação
-- ---------------------------------------------------------------------------

create or replace function confirm_import(p_import_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import record;
  v_row record;
  v_prev record;
  v_has_prev boolean;
  v_bank text;
  v_merged integer := 0;
  v_inserted integer := 0;
begin
  select id, household_id, account_id, status
    into v_import
  from imports
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Importação não encontrada.';
  end if;

  if v_import.status = 'confirmed' then
    raise exception 'Esta importação já foi confirmada.';
  end if;

  if v_import.status <> 'review' then
    raise exception 'Esta importação não está em revisão.';
  end if;

  for v_row in
    select id, date, description, bank_description, amount_cents, direction,
           suggested_category_id, fingerprint,
           match_transaction_id, merge_accepted
    from staged_transactions
    where import_id = p_import_id
      and is_included
    order by date, id
  loop
    v_has_prev := false;
    -- Revisão aberta antes desta migração não tem a coluna preenchida:
    -- ali a descrição ainda é o texto do banco.
    v_bank := coalesce(v_row.bank_description, v_row.description);

    if v_row.match_transaction_id is not null and v_row.merge_accepted then
      select id, date, amount_cents, description, notes, status,
             category_id, fingerprint, bank_description
        into v_prev
      from transactions
      where id = v_row.match_transaction_id
      for update;

      v_has_prev := found;
    end if;

    if v_has_prev then
      update staged_transactions
      set match_previous = jsonb_build_object(
            'date', v_prev.date,
            'amount_cents', v_prev.amount_cents,
            'description', v_prev.description,
            'notes', v_prev.notes,
            'status', v_prev.status,
            'category_id', v_prev.category_id,
            'fingerprint', v_prev.fingerprint,
            'bank_description', v_prev.bank_description
          )
      where id = v_row.id;

      -- Data e valor: o banco. Descrição e observação: as do lançamento
      -- que já existia. Categoria: a dele quando tem. Texto do banco: na
      -- coluna própria.
      update transactions
      set date = v_row.date,
          amount_cents = v_row.amount_cents,
          status = 'cleared',
          category_id = coalesce(v_prev.category_id, v_row.suggested_category_id),
          bank_description = v_bank,
          fingerprint = v_row.fingerprint,
          import_id = p_import_id
      where id = v_prev.id;

      v_merged := v_merged + 1;
    else
      insert into transactions (
        household_id, account_id, category_id, date, amount_cents,
        direction, description, bank_description, status, fingerprint,
        import_id, created_by
      ) values (
        v_import.household_id, v_import.account_id, v_row.suggested_category_id,
        v_row.date, v_row.amount_cents, v_row.direction, v_row.description,
        v_bank, 'cleared', v_row.fingerprint, p_import_id, auth.uid()
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update imports set status = 'confirmed' where id = p_import_id;

  return jsonb_build_object('merged', v_merged, 'inserted', v_inserted);
end;
$$;


-- ---------------------------------------------------------------------------
-- Desfazer: devolve também o texto do banco que havia antes (nenhum,
-- quase sempre)
-- ---------------------------------------------------------------------------

create or replace function undo_import(p_import_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import record;
  v_row record;
  v_prev jsonb;
  v_date date;
  v_amount bigint;
  v_description text;
  v_restored integer := 0;
  v_deleted integer := 0;
begin
  select id, account_id
    into v_import
  from imports
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Importação não encontrada.';
  end if;

  for v_row in
    select match_transaction_id, match_previous
    from staged_transactions
    where import_id = p_import_id
      and match_previous is not null
      and match_transaction_id is not null
  loop
    v_prev := v_row.match_previous;
    v_date := (v_prev ->> 'date')::date;
    v_amount := (v_prev ->> 'amount_cents')::bigint;
    v_description := v_prev ->> 'description';

    update transactions
    set date = v_date,
        amount_cents = v_amount,
        description = v_description,
        notes = v_prev ->> 'notes',
        status = (v_prev ->> 'status')::transaction_status,
        category_id = (v_prev ->> 'category_id')::uuid,
        -- Junção gravada antes desta migração não tem a chave: o
        -- lançamento não tinha texto do banco.
        bank_description = v_prev ->> 'bank_description',
        import_id = null,
        fingerprint = coalesce(
          v_prev ->> 'fingerprint',
          transaction_fingerprint(v_import.account_id, v_date, v_amount, v_description)
        )
    where id = v_row.match_transaction_id
      and import_id = p_import_id;

    if found then
      v_restored := v_restored + 1;
    end if;
  end loop;

  delete from transactions where import_id = p_import_id;
  get diagnostics v_deleted = row_count;

  delete from imports where id = p_import_id;

  return jsonb_build_object('restored', v_restored, 'deleted', v_deleted);
end;
$$;
