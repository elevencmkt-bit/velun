-- ---------------------------------------------------------------------------
-- E-mails do Velun: resumo da semana, fechamento do mês e avisos
-- ---------------------------------------------------------------------------
--
-- email_preferences: o que cada pessoa quer receber. Sem linha = tudo
-- ligado (o padrão do produto); a linha nasce no primeiro envio ou quando
-- a pessoa mexe em Configurações. O token vai no link "parar de receber"
-- do rodapé, que funciona sem entrar no Velun.
--
-- email_log: um registro por e-mail enviado (ou pulado por não ter nada
-- a dizer). A rotina roda de hora em hora; a chave única (pessoa, tipo,
-- período) garante que ninguém recebe o mesmo resumo duas vezes, mesmo se
-- duas rodadas se cruzarem.

create table email_preferences (
  member_id uuid primary key references members (id) on delete cascade,
  weekly boolean not null default true,
  monthly boolean not null default true,
  alerts boolean not null default true,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

comment on table email_preferences is
  'Quais e-mails do Velun cada pessoa recebe. Sem linha = todos ligados.';

alter table email_preferences enable row level security;

-- Cada um vê e muda só as próprias preferências. O token não muda pelo app.
create policy email_preferences_own on email_preferences
  for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

revoke update on email_preferences from anon, authenticated;
grant update (weekly, monthly, alerts, updated_at) on email_preferences to authenticated;

create table email_log (
  id bigint generated always as identity primary key,
  member_id uuid not null references members (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly', 'alerts')),
  -- Semana/dia: a data local (AAAA-MM-DD). Mês: o mês resumido (AAAA-MM).
  period text not null,
  -- 'sent' ou 'skipped' (aviso num dia sem nada vencendo).
  status text not null default 'sent' check (status in ('sent', 'skipped')),
  provider_id text,
  created_at timestamptz not null default now(),
  unique (member_id, kind, period)
);

comment on table email_log is
  'Um registro por e-mail agendado enviado. Só a rotina (service role) lê e escreve.';

-- Sem policy: o app não lê nem escreve aqui, só a rotina de envio.
alter table email_log enable row level security;
