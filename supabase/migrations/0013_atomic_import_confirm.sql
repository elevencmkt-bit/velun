-- Confirmar e desfazer importação, cada um numa transação só.
--
-- O que aconteceu: confirmar era uma sequência de chamadas soltas
-- vindas do servidor — juntar previsões, gravar os lançamentos, marcar
-- a importação como confirmada. Na importação de setembro a primeira
-- tentativa gravou os 66 lançamentos e morreu antes de marcar. A
-- importação continuou "em revisão", o segundo clique gravou tudo de
-- novo, e o mês ficou em dobro.
--
-- Aqui as duas operações viram funções. Dentro de uma função o Postgres
-- garante tudo ou nada: se qualquer passo falhar, nenhum fica gravado.
-- E a importação é travada (`for update`) no começo, então dois cliques
-- simultâneos não passam juntos — o segundo espera o primeiro terminar
-- e aí encontra a importação já confirmada.
--
-- `security invoker`, como a create_transfer: roda com o RLS de quem
-- chamou. A privacidade por conta continua valendo aqui dentro — a
-- função não enxerga nem grava nada que o usuário não poderia.


-- ---------------------------------------------------------------------------
-- Impressão digital
-- ---------------------------------------------------------------------------
--
-- Réplica exata de `computeFingerprint` (src/lib/fingerprint.ts):
-- sha256 de "conta|data|centavos|descrição normalizada", e a
-- normalização é minúscula → NFD → tudo que não for a-z0-9 vira um
-- espaço → apara as pontas.
--
-- Precisa bater byte a byte com a versão do servidor, senão um
-- lançamento restaurado pelo desfazer deixa de ser reconhecido como
-- duplicata de si mesmo numa reimportação. Testado contra a versão em
-- TypeScript antes de entrar.
--
-- Só é usada como reserva: daqui em diante a junção guarda a impressão
-- anterior junto do resto, e o desfazer a devolve sem recalcular. A
-- reserva cobre as junções gravadas antes desta migração.

create or replace function transaction_fingerprint(
  p_account_id uuid,
  p_date date,
  p_amount_cents bigint,
  p_description text
) returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    sha256(convert_to(
      p_account_id::text || '|' ||
      to_char(p_date, 'YYYY-MM-DD') || '|' ||
      p_amount_cents::text || '|' ||
      btrim(regexp_replace(normalize(lower(p_description), NFD), '[^a-z0-9]+', ' ', 'g')),
      'UTF8'
    )),
    'hex'
  )
$$;


-- ---------------------------------------------------------------------------
-- Confirmar
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
  v_merged integer := 0;
  v_inserted integer := 0;
begin
  -- Trava a importação. Um segundo clique fica parado aqui até este
  -- terminar, e aí cai no "já foi confirmada" logo abaixo.
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
    select id, date, description, amount_cents, direction,
           suggested_category_id, fingerprint,
           match_transaction_id, merge_accepted
    from staged_transactions
    where import_id = p_import_id
      and is_included
    order by date, id
  loop
    v_has_prev := false;

    -- Junção: a previsão é quitada pelo lançamento real.
    if v_row.match_transaction_id is not null and v_row.merge_accepted then
      select id, date, amount_cents, description, notes, status,
             category_id, fingerprint
        into v_prev
      from transactions
      where id = v_row.match_transaction_id
      for update;

      v_has_prev := found;
    end if;

    if v_has_prev then
      -- Estado anterior guardado ANTES de sobrescrever: é o que o
      -- desfazer restaura. Agora inclui a impressão digital, pra o
      -- desfazer não precisar recalcular.
      update staged_transactions
      set match_previous = jsonb_build_object(
            'date', v_prev.date,
            'amount_cents', v_prev.amount_cents,
            'description', v_prev.description,
            'notes', v_prev.notes,
            'status', v_prev.status,
            'category_id', v_prev.category_id,
            'fingerprint', v_prev.fingerprint
          )
      where id = v_row.id;

      -- Quem ganha o quê (mesma regra de antes):
      -- data e valor: o banco. Descrição: a previsão, que tem o nome
      -- legível. Categoria: a da previsão quando tem. Texto do banco:
      -- vai pra observação, depois do que já houvesse lá.
      update transactions
      set date = v_row.date,
          amount_cents = v_row.amount_cents,
          status = 'cleared',
          category_id = coalesce(v_prev.category_id, v_row.suggested_category_id),
          notes = concat_ws(E'\n', nullif(v_prev.notes, ''), v_row.description),
          fingerprint = v_row.fingerprint,
          import_id = p_import_id
      where id = v_prev.id;

      v_merged := v_merged + 1;
    else
      -- Sem previsão (ou a previsão foi apagada antes de confirmar):
      -- entra como lançamento novo.
      insert into transactions (
        household_id, account_id, category_id, date, amount_cents,
        direction, description, status, fingerprint, import_id, created_by
      ) values (
        v_import.household_id, v_import.account_id, v_row.suggested_category_id,
        v_row.date, v_row.amount_cents, v_row.direction, v_row.description,
        'cleared', v_row.fingerprint, p_import_id, auth.uid()
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update imports set status = 'confirmed' where id = p_import_id;

  return jsonb_build_object('merged', v_merged, 'inserted', v_inserted);
end;
$$;


-- ---------------------------------------------------------------------------
-- Desfazer
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

  -- Previsão quitada por junção volta ao que era, em vez de ser
  -- apagada: ela existia antes da importação e não é dela pra apagar.
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
        import_id = null,
        -- Junção gravada antes desta migração não guardou a impressão
        -- anterior; recalcula com a mesma regra do servidor.
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

  -- O resto é o que a importação criou. As previsões restauradas já
  -- perderam o import_id acima, então ficam de fora.
  delete from transactions where import_id = p_import_id;
  get diagnostics v_deleted = row_count;

  -- Leva o staging junto (on delete cascade).
  delete from imports where id = p_import_id;

  return jsonb_build_object('restored', v_restored, 'deleted', v_deleted);
end;
$$;


revoke execute on function confirm_import(uuid) from public;
revoke execute on function undo_import(uuid) from public;
grant execute on function confirm_import(uuid) to authenticated;
grant execute on function undo_import(uuid) to authenticated;
grant execute on function transaction_fingerprint(uuid, date, bigint, text) to authenticated;
