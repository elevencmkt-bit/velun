-- Fase A da privacidade seletiva por conta.
-- Referência: "Velun — Especificação: privacidade seletiva por conta".
--
-- Princípio: a privacidade é propriedade da CONTA, não do lançamento. Uma
-- conta conjunta existe pra que os dois vejam o que entra e sai; esconder
-- uma linha ali contradiz o propósito da conta e é desmentido pelo extrato
-- do banco. Então `transactions` não muda — tudo vive em `accounts`.
--
-- Esta migration não altera o que ninguém vê hoje: toda conta existente
-- vira conjunta (owner_id null, visibility 'shared'), que é o comportamento
-- atual. A primeira conta pessoal é criada deliberadamente pelo dono.

-- ---------------------------------------------------------------------------
-- níveis de visibilidade
-- ---------------------------------------------------------------------------

-- Ordem do enum = ordem crescente de exposição. Os níveis são cumulativos
-- (cada um mostra tudo do anterior mais uma camada), o que permite tratar o
-- filtro como um corte progressivo em vez de quatro caminhos separados.
--
--   hidden           nada                        conta da empresa
--   balance_only     saldo                       reserva pessoal
--   categories_only  saldo + totais + categorias saúde conjunta sem extrato
--   shared           tudo                        conta do casal / aberta
create type account_visibility as enum (
  'hidden',
  'balance_only',
  'categories_only',
  'shared'
);

alter table accounts
  add column owner_id uuid references members (id) on delete restrict,
  add column visibility account_visibility not null default 'shared';

-- Conta sem dono é conta do casal, e conta do casal é sempre compartilhada.
-- Sem esta constraint uma conta sem dono poderia ficar oculta de todo mundo,
-- inclusive de quem a criou — ninguém poderia reabri-la.
alter table accounts
  add constraint accounts_visibility_requires_owner check (
    (owner_id is null and visibility = 'shared') or owner_id is not null
  );

create index accounts_owner_id_idx on accounts (owner_id);

comment on column accounts.owner_id is
  'Null = conta do casal. Preenchido = conta pessoal; só o dono lança nela.';
comment on column accounts.visibility is
  'O que os OUTROS membros veem. O dono sempre vê a própria conta inteira.';

-- ---------------------------------------------------------------------------
-- RLS: corta no banco o que nunca pode ser lido
-- ---------------------------------------------------------------------------

-- RLS é binário: a linha passa ou não passa. Os níveis balance_only e
-- categories_only precisam que a MESMA linha seja parcialmente visível
-- (contar pro saldo, não aparecer no extrato), e isso não é expressável em
-- policy — fica na camada de escopo da aplicação (src/lib/visibility.ts).
--
-- O que a policy garante é o piso: `hidden` some de verdade. Nem a linha da
-- conta, nem seus lançamentos, nem suas recorrências chegam ao outro membro,
-- independente de qualquer código de aplicação estar correto.

drop policy accounts_all on accounts;

create policy accounts_rw on accounts
  for all
  using (
    household_id = current_household_id()
    and (
      owner_id is null                -- conta do casal
      or owner_id = auth.uid()        -- minha conta pessoal, em qualquer nível
      or visibility <> 'hidden'       -- conta pessoal do outro, não oculta
    )
  )
  with check (
    -- Só mexo em conta do casal ou em conta minha. Não posso criar uma conta
    -- pessoal no nome do outro nem alterar o nível da conta dele.
    household_id = current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

-- As policies abaixo delegam a decisão de visibilidade pra `accounts`: o RLS
-- se aplica também dentro da subquery, então uma conta que a policy acima
-- esconde desaparece junto com tudo que está pendurado nela. Uma regra só,
-- num lugar só.

drop policy transactions_all on transactions;

create policy transactions_rw on transactions
  for all
  using (
    household_id = current_household_id()
    and account_id in (select id from accounts)
  )
  with check (
    -- Mais restrito que o `using` de propósito: você pode LER a conta
    -- pessoal aberta do seu parceiro, mas não lançar nela.
    household_id = current_household_id()
    and account_id in (
      select id from accounts
      where owner_id is null or owner_id = auth.uid()
    )
  );

-- `recurrences` não tem coluna account_id: a conta vive dentro de
-- `template` jsonb (ver materialize-occurrences.ts, que lê
-- template.account_id). O corte é o mesmo, lendo a chave do jsonb.
drop policy recurrences_all on recurrences;

create policy recurrences_rw on recurrences
  for all
  using (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in (select id from accounts)
  )
  with check (
    household_id = current_household_id()
    and (template ->> 'account_id')::uuid in (
      select id from accounts
      where owner_id is null or owner_id = auth.uid()
    )
  );
