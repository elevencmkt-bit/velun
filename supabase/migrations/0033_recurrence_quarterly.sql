-- ---------------------------------------------------------------------------
-- Recorrência trimestral e semestral
-- ---------------------------------------------------------------------------
--
-- Duas frequências novas: a cada 3 meses e a cada 6 meses. Funcionam como
-- a mensal (num dia do mês; dia 31 cai no último dia), contando a partir
-- do mês de início.
--
-- A rotina diária (top_up_recurrences, 0031) passa a completar essas
-- também. Só o trecho que gera as datas mudou.

alter type recurrence_frequency add value if not exists 'quarterly';
alter type recurrence_frequency add value if not exists 'semiannual';

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
      select case r.frequency::text
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
          case r.frequency::text
            when 'monthly' then date_trunc('month', greatest(v_last, r.starts_on))
            -- de 3 em 3 / 6 em 6 meses: conta a partir do mês de início,
            -- pra não sair do compasso
            when 'quarterly' then date_trunc('month', r.starts_on)
            when 'semiannual' then date_trunc('month', r.starts_on)
            else r.starts_on::timestamp
          end,
          v_horizon::timestamp,
          case r.frequency::text
            when 'weekly' then interval '7 days'
            when 'yearly' then interval '1 year'
            when 'quarterly' then interval '3 months'
            when 'semiannual' then interval '6 months'
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

revoke all on function top_up_recurrences(int) from public;
revoke all on function top_up_recurrences(int) from anon, authenticated;
