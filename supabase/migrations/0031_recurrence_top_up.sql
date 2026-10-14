-- ---------------------------------------------------------------------------
-- Recorrências que não acabam
-- ---------------------------------------------------------------------------
--
-- Ao criar uma recorrência, o app grava as próximas 12 ocorrências como
-- previstas (pending). Ninguém gerava as seguintes: um aluguel mensal
-- sumia de A vencer depois de um ano, e um semanal depois de 12 semanas.
--
-- Aqui uma rotina completa, uma vez por dia, cada recorrência ativa até
-- 12 meses à frente:
--
-- - continua de onde a última ocorrência parou (a que tiver a maior data,
--   paga ou prevista). Uma ocorrência que a pessoa apagou no meio do
--   caminho não volta;
-- - nunca cria nada no passado: começa no "hoje" do fuso da casa;
-- - respeita o "Termina em" e usa o modelo atual da recorrência (conta,
--   valor, categoria), então "Mover" e edições valem pras novas;
-- - pula recorrência de conta arquivada; categoria que não existe mais
--   vira "sem categoria" em vez de travar.
--
-- O dia do mês segue a regra do app: dia 31 cai no último dia do mês.

create or replace function top_up_recurrences(p_months int default 12)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_last date;
  v_today date;
  v_horizon date;
  v_day int;
  v_account uuid;
  v_category uuid;
  v_author uuid;
  v_amount bigint;
  v_description text;
  v_inserted int;
  v_total int := 0;
begin
  -- Um de cada vez: duas chamadas juntas não duplicam nada.
  perform pg_advisory_xact_lock(hashtext('top_up_recurrences'));

  for r in
    select rc.*, h.timezone
    from recurrences rc
    join households h on h.id = rc.household_id
    where rc.is_active
  loop
    v_today := (now() at time zone r.timezone)::date;
    v_horizon := (v_today + make_interval(months => p_months))::date;
    if r.ends_on is not null and r.ends_on < v_today then
      continue;
    end if;

    -- A ocorrência mais recente e quem lançou (as novas ficam no nome dele).
    select t.date, t.created_by into v_last, v_author
    from transactions t
    where t.recurrence_id = r.id
    order by t.date desc, t.created_at desc
    limit 1;
    if v_last is null then
      continue; -- nunca foi gravada (ou apagaram todas): não adivinha
    end if;

    v_account := nullif(r.template->>'account_id', '')::uuid;
    v_amount := (r.template->>'amount_cents')::bigint;
    v_description := coalesce(r.template->>'description', '');
    if v_account is null or v_amount is null or v_amount <= 0
       or (r.template->>'direction') not in ('in', 'out') then
      continue;
    end if;
    if not exists (
      select 1 from accounts a
      where a.id = v_account and a.household_id = r.household_id and not a.is_archived
    ) then
      continue;
    end if;
    if not exists (select 1 from members m where m.id = v_author) then
      continue;
    end if;

    v_category := nullif(r.template->>'category_id', '')::uuid;
    if v_category is not null
       and not exists (select 1 from categories c where c.id = v_category and c.household_id = r.household_id) then
      v_category := null;
    end if;

    v_day := coalesce(r.day_of_month, extract(day from r.starts_on)::int);

    insert into transactions (
      household_id, account_id, category_id, date, amount_cents, direction,
      description, notes, status, recurrence_id, fingerprint, created_by
    )
    select
      r.household_id, v_account, v_category, d.dt, v_amount,
      (r.template->>'direction')::transaction_direction,
      v_description, nullif(r.template->>'notes', ''), 'pending', r.id,
      transaction_fingerprint(v_account, d.dt, v_amount, v_description),
      v_author
    from (
      select case r.frequency
        when 'weekly' then g.dt
        when 'yearly' then g.dt
        else (g.dt + (least(
          v_day,
          extract(day from (g.dt + interval '1 month' - interval '1 day'))::int
        ) - 1))::date
      end as dt
      from (
        select gs::date as dt
        from generate_series(
          case r.frequency
            when 'monthly' then date_trunc('month', greatest(v_last, r.starts_on))
            else r.starts_on::timestamp
          end,
          v_horizon::timestamp,
          case r.frequency
            when 'weekly' then interval '7 days'
            when 'yearly' then interval '1 year'
            else interval '1 month'
          end
        ) gs
      ) g
    ) d
    where d.dt > v_last
      and d.dt >= v_today
      and d.dt <= v_horizon
      and (r.ends_on is null or d.dt <= r.ends_on)
    order by d.dt;

    get diagnostics v_inserted = row_count;
    v_total := v_total + v_inserted;
  end loop;

  return v_total;
end;
$$;

-- Só a rotina diária (e quem administra o banco) chama.
revoke all on function top_up_recurrences(int) from public;
revoke all on function top_up_recurrences(int) from anon, authenticated;

-- Completa já o que estiver faltando.
select top_up_recurrences();

-- Todo dia às 08:15 UTC (de madrugada nos EUA e no Brasil). O pg_cron
-- existe no Supabase; num Postgres sem ele, só a função fica.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('velun-recorrencias', '15 8 * * *', 'select public.top_up_recurrences()');
  end if;
end;
$$;
