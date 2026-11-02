-- ---------------------------------------------------------------------------
-- Pendentes do banco
-- ---------------------------------------------------------------------------
--
-- O print do app mostra, no topo, o que o banco ainda não lançou
-- ("Pending"). O dinheiro já saiu do saldo disponível, mas o valor, a
-- data e o nome ainda podem mudar (gorjeta, reserva de posto).
--
-- Agora eles entram, marcados como "pendente no banco" (bank_pending).
-- Contam no saldo, como no app. Quando o lançamento de verdade chega
-- num extrato ou print, ele toma o lugar do pendente (a junção de
-- sempre, match_transaction_id), e a marca sai.
--
-- confirm_import grava a marca e, na junção, guarda o estado anterior
-- (marca e importação de origem); undo_import devolve os dois.

alter table staged_transactions
  add column if not exists bank_pending boolean not null default false;

alter table transactions
  add column if not exists bank_pending boolean not null default false;

create index if not exists transactions_bank_pending_idx
  on transactions (account_id)
  where bank_pending;


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
  v_group uuid;
  v_card_name text;
  v_payment_desc text;
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
           match_transaction_id, merge_accepted,
           card_payment_account_id, card_payment_accepted, bank_pending
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
             category_id, fingerprint, bank_description, bank_pending, import_id,
             recurrence_id
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
            'bank_description', v_prev.bank_description,
            'bank_pending', v_prev.bank_pending,
            'import_id', v_prev.import_id
          )
      where id = v_row.id;

      -- Data e valor: o banco. Descrição e observação: as do lançamento
      -- que já existia. Categoria: a dele quando tem. Texto do banco: na
      -- coluna própria.
      --
      -- Pendente do banco que agora lançou: o nome também vem do banco
      -- lançado ("WM SUPERCENTER 1031..." vira "Walmart"), menos quando
      -- o pendente tinha quitado uma previsão (aí fica o nome dela,
      -- "Salário"). E a linha pendente que quita uma previsão continua
      -- marcada como pendente no banco, até o lançamento de verdade chegar.
      update transactions
      set date = v_row.date,
          amount_cents = v_row.amount_cents,
          status = 'cleared',
          description = case when v_prev.bank_pending and not v_row.bank_pending
                                  and v_prev.recurrence_id is null
                             then v_row.description else v_prev.description end,
          category_id = coalesce(v_prev.category_id, v_row.suggested_category_id),
          bank_description = v_bank,
          bank_pending = v_row.bank_pending,
          fingerprint = v_row.fingerprint,
          import_id = p_import_id
      where id = v_prev.id;

      v_merged := v_merged + 1;
    elsif v_row.card_payment_account_id is not null and v_row.card_payment_accepted then
      -- Pagamento de fatura: transferência da corrente pro cartão, as
      -- duas pontas presas a esta importação (desfazer apaga as duas).
      v_group := gen_random_uuid();
      select name into v_card_name from accounts where id = v_row.card_payment_account_id;
      v_payment_desc := 'Pagamento da fatura · ' || coalesce(v_card_name, 'cartão');

      insert into transactions (
        household_id, account_id, category_id, date, amount_cents,
        direction, description, bank_description, status, fingerprint,
        import_id, transfer_group_id, created_by
      ) values (
        v_import.household_id, v_import.account_id, null,
        v_row.date, v_row.amount_cents, 'out', v_payment_desc,
        v_bank, 'cleared', v_row.fingerprint, p_import_id, v_group, auth.uid()
      );

      insert into transactions (
        household_id, account_id, category_id, date, amount_cents,
        direction, description, status, fingerprint,
        import_id, transfer_group_id, created_by
      ) values (
        v_import.household_id, v_row.card_payment_account_id, null,
        v_row.date, v_row.amount_cents, 'in', v_payment_desc, 'cleared',
        transaction_fingerprint(v_row.card_payment_account_id, v_row.date, v_row.amount_cents, v_payment_desc),
        p_import_id, v_group, auth.uid()
      );

      v_inserted := v_inserted + 1;
    else
      insert into transactions (
        household_id, account_id, category_id, date, amount_cents,
        direction, description, bank_description, status, fingerprint,
        import_id, created_by, bank_pending
      ) values (
        v_import.household_id, v_import.account_id, v_row.suggested_category_id,
        v_row.date, v_row.amount_cents, v_row.direction, v_row.description,
        v_bank, 'cleared', v_row.fingerprint, p_import_id, auth.uid(), v_row.bank_pending
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update imports set status = 'confirmed' where id = p_import_id;

  return jsonb_build_object('merged', v_merged, 'inserted', v_inserted);
end;
$$;


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
        -- Volta a ser da importação anterior, quando era (o pendente
        -- trazido por um print e depois lançado por outro).
        import_id = (v_prev ->> 'import_id')::uuid,
        bank_pending = coalesce((v_prev ->> 'bank_pending')::boolean, false),
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
