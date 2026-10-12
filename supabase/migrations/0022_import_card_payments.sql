-- Extrato da corrente pagando a fatura do cartão.
--
-- A linha "pagamento do cartão" do extrato não é gasto (o gasto foi cada
-- compra). Na revisão da importação, o Velun reconhece essas linhas e,
-- ao confirmar, grava como transferência da corrente pro cartão — o que
-- deixa a fatura paga e não conta o dinheiro duas vezes.
--
-- staged_transactions ganha a sugestão (qual cartão) e a decisão de quem
-- revisa (aceitar ou não). confirm_import grava as duas pontas da
-- transferência, ambas presas à importação: desfazer apaga as duas.

alter table staged_transactions
  add column card_payment_account_id uuid references accounts (id) on delete set null,
  add column card_payment_accepted boolean not null default false;


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
           card_payment_account_id, card_payment_accepted
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
