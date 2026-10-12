-- Mover uma recorrência de uma conta pra outra.
--
-- O caso que motivou: uma despesa da casa muda de mão. A Spectrum e a
-- creche passaram a ser pagas pela conta da esposa, mas estavam
-- cadastradas na conta do casal — e a previsão daquela conta contava
-- com ~$1.300/mês de saída que não ia sair dela.
--
-- O que move:
--   - o modelo da recorrência (as próximas ocorrências nascem na conta
--     nova);
--   - as ocorrências PREVISTAS (`pending`), inclusive as atrasadas.
-- O que fica:
--   - o que já foi confirmado. Aquilo aconteceu naquela conta; mudar de
--     conta reescreveria o histórico e desfaria o saldo dela.
--
-- Quem pode: quem mexe nas DUAS contas — a de origem e a de destino.
-- `security invoker`, então são as regras da 0016 que decidem: ninguém
-- empurra despesa pra conta pessoal do outro; o dono puxa. Tudo numa
-- transação: se o destino for recusado, nada se move.

create or replace function move_recurrence(p_recurrence_id uuid, p_account_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recurrence record;
  v_moved integer := 0;
begin
  select id, template
    into v_recurrence
  from recurrences
  where id = p_recurrence_id
  for update;

  if not found then
    raise exception 'Recorrência não encontrada.';
  end if;

  if (v_recurrence.template ->> 'account_id')::uuid = p_account_id then
    raise exception 'A recorrência já está nessa conta.';
  end if;

  -- Conferido aqui, e não só pela regra do banco no `update` logo abaixo,
  -- pra a mensagem ser clara: a regra recusaria com "violates row-level
  -- security policy", que não diz nada a ninguém.
  if not exists (
    select 1 from accounts
    where id = p_account_id
      and (owner_id is null or owner_id = auth.uid())
      and not is_archived
  ) then
    raise exception 'Você não pode mover pra essa conta. Só pra conta do casal ou uma conta sua.';
  end if;

  update recurrences
  set template = jsonb_set(template, '{account_id}', to_jsonb(p_account_id::text))
  where id = p_recurrence_id;

  -- A impressão digital inclui a conta: muda de conta, muda a impressão.
  -- Sem isso, a ocorrência movida deixaria de ser reconhecida como
  -- duplicata numa importação do extrato da conta nova.
  update transactions
  set account_id = p_account_id,
      fingerprint = transaction_fingerprint(p_account_id, date, amount_cents, description)
  where recurrence_id = p_recurrence_id
    and status = 'pending';

  get diagnostics v_moved = row_count;

  return jsonb_build_object('moved', v_moved);
end;
$$;

revoke execute on function move_recurrence(uuid, uuid) from public;
grant execute on function move_recurrence(uuid, uuid) to authenticated;
