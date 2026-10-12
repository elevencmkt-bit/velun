-- País e fuso da casa.
--
-- O "hoje" do app (o que está atrasado, o que vence esta semana, o mês
-- que abre por padrão) seguia o relógio do servidor, que fica em UTC: em
-- Orlando, das 20h à meia-noite, o app já achava que era amanhã. Agora
-- segue o fuso da casa.
--
-- O país define os padrões sugeridos (moeda e fuso) e, mais adiante, o
-- formato de importação dos bancos. A moeda continua sendo escolha à
-- parte e nunca converte valores: dólar mostra tudo em dólar, real mostra
-- tudo em real.

alter table households
  add column country text not null default 'US'
    check (country in ('US', 'BR')),
  add column timezone text not null default 'America/New_York'
    -- Um fuso que o Postgres não conhece faz esta conta falhar, e a
    -- gravação é recusada.
    check (now() at time zone timezone is not null);
