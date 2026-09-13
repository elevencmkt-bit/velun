-- Moeda do household, configurável em Configurações. Default USD pra
-- não mudar a exibição de quem já usa o app (era hardcoded em USD).
alter table households
  add column currency text not null default 'USD'
  check (currency in ('BRL', 'USD', 'EUR'));

-- households só tinha policy de SELECT — sem policy de UPDATE, trocar
-- a moeda seria bloqueado pelo RLS em silêncio (mesmo bug já visto e
-- corrigido em members: Supabase não retorna erro nesse caso, só zero
-- linhas afetadas).
create policy households_update on households
  for update
  using (id = current_household_id())
  with check (id = current_household_id());
