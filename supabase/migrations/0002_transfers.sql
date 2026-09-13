-- Fase 4: transferência = duas linhas atômicas (uma out, uma in) com o
-- mesmo transfer_group_id. Função em vez de dois inserts sequenciais
-- do client, para nunca deixar uma perna órfã se o segundo insert falhar.
-- security invoker: roda com o RLS do usuário chamador, não bypassa nada.

create or replace function create_transfer(
  p_household_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_date date,
  p_amount_cents bigint,
  p_description text,
  p_notes text,
  p_created_by uuid,
  p_from_fingerprint text,
  p_to_fingerprint text
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_group_id uuid := gen_random_uuid();
begin
  if p_from_account_id = p_to_account_id then
    raise exception 'Conta de origem e destino não podem ser a mesma.';
  end if;

  insert into transactions (
    household_id, account_id, category_id, date, amount_cents, direction,
    description, notes, status, transfer_group_id, fingerprint, created_by
  ) values (
    p_household_id, p_from_account_id, null, p_date, p_amount_cents, 'out',
    p_description, p_notes, 'cleared', v_group_id, p_from_fingerprint, p_created_by
  );

  insert into transactions (
    household_id, account_id, category_id, date, amount_cents, direction,
    description, notes, status, transfer_group_id, fingerprint, created_by
  ) values (
    p_household_id, p_to_account_id, null, p_date, p_amount_cents, 'in',
    p_description, p_notes, 'cleared', v_group_id, p_to_fingerprint, p_created_by
  );

  return v_group_id;
end;
$$;

grant execute on function create_transfer(
  uuid, uuid, uuid, date, bigint, text, text, uuid, text, text
) to authenticated;
