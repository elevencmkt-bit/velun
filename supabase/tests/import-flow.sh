#!/usr/bin/env bash
# Reconstrói o banco do zero com todas as migrações e roda a bateria inteira.
set -u
D=/var/tmp/velun-pg; B=/usr/lib/postgresql/16/bin; S=$(cd "$(dirname "$0")" && pwd)
LEVI=aaaaaaaa-0000-0000-0000-00000000000a; ESPOSA=bbbbbbbb-0000-0000-0000-00000000000b
SYL=f0000000-0000-0000-0000-000000000001
su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1; rm -rf $D; mkdir -p $D; chown postgres:postgres $D
su postgres -c "$B/initdb -D $D/data -A trust >/dev/null" && su postgres -c "$B/pg_ctl -D $D/data -o '-p 54329 -k $D' -l $D/log start >/dev/null"; sleep 2
admin() { psql -h $D -p 54329 -U postgres -tA -q -c "$1"; }
as_user() { psql -h $D -p 54329 -U postgres -tA -q <<SQL 2>&1
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '$1', true) \gset
$2
commit;
SQL
}
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok    $1"; else echo "  FALHA $1 — veio [$2], esperado [$3]"; FAIL=1; fi; }

psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
SQL
echo "migrações:"
for f in "$S"/../migrations/*.sql; do
  if psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" >/dev/null 2>$S/mig.err; then :; else echo "  FALHA $(basename $f)"; cat $S/mig.err; FAIL=1; fi
done
[ $FAIL = 0 ] && echo "  ok    as $(ls "$S"/../migrations/*.sql | wc -l) aplicam do zero, cada uma numa transação"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 --single-transaction -f $S/fixture.sql

echo "privacidade da confirmação:"
as_user $ESPOSA "select confirm_import('10000000-0000-0000-0000-000000000001');" >/dev/null
check "esposa não confirma importação da conta pessoal" "$(admin "select status from imports where id='10000000-0000-0000-0000-000000000001'")" "review"

echo "confirmar:"
check "Levi confirma" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000001');")" '{"merged": 1, "inserted": 2}'
check "importação marcada" "$(admin "select status from imports where id='10000000-0000-0000-0000-000000000001'")" "confirmed"
check "duas Stltones idênticas mantidas" "$(admin "select count(*) from transactions where description='Sp Stltones.Com'")" "2"
check "linha desmarcada não entra" "$(admin "select count(*) from transactions where description='Linha desmarcada'")" "0"
check "Sylaris quitado" "$(admin "select status from transactions where id='$SYL'")" "cleared"
check "observação continua a sua" "$(admin "select notes from transactions where id='$SYL'")" "pago via Zelle"
check "texto do banco na coluna própria" "$(admin "select bank_description from transactions where id='$SYL'")" "Zelle Credit From Sylaris, LLC Ref# 626500g0ie64"
check "revisão antiga (sem coluna): texto do banco = descrição" "$(admin "select count(*) from transactions where description='Sp Stltones.Com' and bank_description='Sp Stltones.Com'")" "2"
check "snapshot guarda estado pendente" "$(admin "select match_previous->>'status' from staged_transactions where match_previous is not null")" "pending"
check "snapshot guarda impressão" "$(admin "select (match_previous ? 'fingerprint')::text from staged_transactions where match_previous is not null")" "true"
check "segundo clique recusado" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000001');" | grep -o 'já foi confirmada')" "já foi confirmada"
check "segundo clique não duplica" "$(admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-000000000001'")" "3"

echo "desfazer:"
check "desfaz" "$(as_user $LEVI "select undo_import('10000000-0000-0000-0000-000000000001');")" '{"deleted": 2, "restored": 1}'
check "Sylaris volta a previsão" "$(admin "select status||' · '||notes from transactions where id='$SYL'")" "pending · pago via Zelle"
check "desfazer tira o texto do banco da previsão" "$(admin "select coalesce(bank_description, 'nenhum') from transactions where id='$SYL'")" "nenhum"
check "impressão original de volta" "$(admin "select (fingerprint = transaction_fingerprint(account_id, date, amount_cents, description))::text from transactions where id='$SYL'")" "true"
check "importação e staging somem" "$(admin "select count(*) from imports")/$(admin "select count(*) from staged_transactions")" "0/0"

echo "tudo ou nada:"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', 'setembro.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into staged_transactions (import_id, date, description, amount_cents, direction, fingerprint, match_transaction_id, merge_accepted, is_included) values
  ('10000000-0000-0000-0000-000000000002', '2026-09-22', 'Zelle Credit From Sylaris', 40000, 'in', 'fp-s', 'f0000000-0000-0000-0000-000000000001', true, true),
  ('10000000-0000-0000-0000-000000000002', '2026-09-02', 'linha boa', 100, 'out', 'fp-a', null, true, true),
  ('10000000-0000-0000-0000-000000000002', '2026-09-30', 'BOOM', 200, 'out', 'fp-b', null, true, true);
create function boom() returns trigger language plpgsql as $$ begin if new.description = 'BOOM' then raise exception 'falha simulada'; end if; return new; end $$;
create trigger boom before insert on transactions for each row execute function boom();
SQL
as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000002');" >/dev/null
check "falha na última linha: importação segue em revisão" "$(admin "select status from imports where id='10000000-0000-0000-0000-000000000002'")" "review"
check "falha na última linha: nada gravado" "$(admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-000000000002'")" "0"
check "falha na última linha: junção também desfeita" "$(admin "select status from transactions where id='$SYL'")" "pending"
admin "drop trigger boom on transactions; drop function boom();"

echo "dois cliques simultâneos:"
( psql -h $D -p 54329 -U postgres -tA -q <<SQL > $S/c1.txt 2>&1
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '$LEVI', true) \gset
select confirm_import('10000000-0000-0000-0000-000000000002'); select pg_sleep(3); commit;
SQL
) & sleep 0.5
as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000002');" > $S/c2.txt; wait
check "clique 1 confirma" "$(grep -c merged $S/c1.txt)" "1"
check "clique 2 recusado" "$(grep -o 'já foi confirmada' $S/c2.txt)" "já foi confirmada"
check "gravado uma vez só" "$(admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-000000000002'")" "3"

echo "desfazer junção antiga (sem impressão no snapshot):"
admin "update staged_transactions set match_previous = match_previous - 'fingerprint' where match_previous is not null"
as_user $LEVI "select undo_import('10000000-0000-0000-0000-000000000002');" >/dev/null
check "recalcula a impressão certa" "$(admin "select (fingerprint = transaction_fingerprint(account_id, date, amount_cents, description))::text from transactions where id='$SYL'")" "true"

echo "privacidade das importações (conta do Levi OCULTA):"
as_user $LEVI "update accounts set visibility = 'hidden' where id = 'acc00000-0000-0000-0000-000000000001';" >/dev/null
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into accounts (id, household_id, name, type) values ('acc00000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Conta Conjunta', 'checking');
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', 'extrato-pessoal.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', 'conjunta.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into staged_transactions (import_id, date, description, amount_cents, direction, fingerprint) values
  ('10000000-0000-0000-0000-000000000003', '2026-09-10', 'Presente surpresa - joalheria', 89000, 'out', 'fp-x'),
  ('10000000-0000-0000-0000-000000000004', '2026-09-10', 'Mercado', 15000, 'out', 'fp-m');
insert into net_worth_snapshots (household_id, account_id, date, balance_cents) values
  ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-09-30', 1234500);
insert into goals (household_id, owner_id, visibility, kind, name, target_cents, tracking, account_id) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'shared', 'save', 'Fundo secreto', 500000, 'account', 'acc00000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000001', null, 'hidden', 'save', 'Viagem da família', 300000, 'deposits', null);
SQL
check "esposa: só a importação da conjunta" "$(as_user $ESPOSA "select string_agg(file_path, ',' order by file_path) from imports;")" "conjunta.pdf"
check "esposa: só a linha da conjunta" "$(as_user $ESPOSA "select string_agg(description, ',' order by description) from staged_transactions;")" "Mercado"
check "esposa: não vê saldo da conta oculta" "$(as_user $ESPOSA "select count(*) from net_worth_snapshots;")" "0"
check "esposa: só a meta da casa (a dele segue conta oculta)" "$(as_user $ESPOSA "select string_agg(name, ',' order by name) from goals;")" "Viagem da família"
as_user $ESPOSA "delete from imports where id = '10000000-0000-0000-0000-000000000003';" >/dev/null
check "esposa não descarta a importação dele" "$(admin "select count(*) from imports where id='10000000-0000-0000-0000-000000000003'")" "1"
check "Levi: vê as duas importações" "$(as_user $LEVI "select string_agg(file_path, ',' order by file_path) from imports;")" "conjunta.pdf,extrato-pessoal.pdf"
check "Levi: vê o saldo e as duas metas" "$(as_user $LEVI "select count(*) from net_worth_snapshots;")/$(as_user $LEVI "select count(*) from goals;")" "1/2"

echo "juntar com lançamento já confirmado:"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into transactions (id, household_id, account_id, category_id, date, amount_cents, direction, description, notes, status, fingerprint, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002',
   'ca700000-0000-0000-0000-00000000000a', '2026-09-17', 3049, 'out', 'Netflix', null, 'cleared', 'fp-netflix-manual', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', 'conjunta-set.pdf', 'pdf', 'confirmed', 'aaaaaaaa-0000-0000-0000-00000000000a');
-- conta conjunta só pode ter uma revisão: a anterior (conjunta.pdf) é confirmada antes
update imports set status = 'confirmed' where id = '10000000-0000-0000-0000-000000000004';
update imports set status = 'review' where id = '10000000-0000-0000-0000-000000000005';
insert into staged_transactions (import_id, date, description, amount_cents, direction, fingerprint, match_transaction_id, merge_accepted, is_included) values
  ('10000000-0000-0000-0000-000000000005', '2026-09-18', 'PIN Purchase Netflix.Com 4899 Los Gatos', 3049, 'out', 'fp-netflix-banco', 'e0000000-0000-0000-0000-000000000001', false, true);
SQL
check "desmarcado: entra separado, o seu fica intacto" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000005');")" '{"merged": 0, "inserted": 1}'
check "…dois lançamentos de Netflix (o seu + o do banco)" "$(admin "select count(*) from transactions where amount_cents = 3049")" "2"
as_user $LEVI "select undo_import('10000000-0000-0000-0000-000000000005');" >/dev/null
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', 'conjunta-set.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into staged_transactions (import_id, date, description, amount_cents, direction, fingerprint, match_transaction_id, merge_accepted, is_included) values
  ('10000000-0000-0000-0000-000000000006', '2026-09-18', 'PIN Purchase Netflix.Com 4899 Los Gatos', 3049, 'out', 'fp-netflix-banco', 'e0000000-0000-0000-0000-000000000001', true, true);
SQL
check "marcado pra juntar: substitui" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000006');")" '{"merged": 1, "inserted": 0}'
check "…um Netflix só, com o seu nome e a data do banco" "$(admin "select count(*)||' · '||max(description)||' · '||max(date) from transactions where amount_cents = 3049")" "1 · Netflix · 2026-09-18"
check "…categoria que você escolheu mantida" "$(admin "select (category_id = 'ca700000-0000-0000-0000-00000000000a')::text from transactions where id='e0000000-0000-0000-0000-000000000001'")" "true"
as_user $LEVI "select undo_import('10000000-0000-0000-0000-000000000006');" >/dev/null
check "desfazer devolve como CONFIRMADO, não previsão" "$(admin "select status||' · '||date||' · '||fingerprint from transactions where id='e0000000-0000-0000-0000-000000000001'")" "cleared · 2026-09-17 · fp-netflix-manual"

echo "uma revisão por conta:"
novo_review() { psql -h $D -p 54329 -U postgres -tA -q -c "insert into imports (household_id, account_id, file_path, file_type, status, created_by) values ('11111111-0000-0000-0000-000000000001', '$1', '$2', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');" 2>&1 | grep -o 'imports_one_review_per_account' | head -1; }
check "segunda revisão na mesma conta é barrada" "$(novo_review acc00000-0000-0000-0000-000000000001 duplicado.pdf)" "imports_one_review_per_account"
admin "update imports set status='confirmed' where id='10000000-0000-0000-0000-000000000003'"
check "depois de confirmar, nova revisão é aceita" "$(novo_review acc00000-0000-0000-0000-000000000001 outubro.pdf)" ""
check "revisão em outra conta é aceita junto" "$(novo_review acc00000-0000-0000-0000-000000000002 conjunta-out.pdf)" ""
check "revisões em contas diferentes convivem" "$(admin "select count(distinct account_id)||'/'||count(*) from imports where status='review'")" "2/2"

echo "privacidade de escrita (conta pessoal do Levi ABERTA pra esposa):"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into accounts (id, household_id, name, type, owner_id, visibility) values
  ('acc00000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Pessoal aberta do Levi', 'checking', 'aaaaaaaa-0000-0000-0000-00000000000a', 'shared'),
  ('acc00000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'Pessoal dela', 'checking', 'bbbbbbbb-0000-0000-0000-00000000000b', 'hidden');
insert into transactions (id, household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by) values
  ('e1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000005', '2026-09-10', 5000, 'out', 'Gasto do Levi', 'w1', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000005', '2026-09-11', 7000, 'out', 'Outro gasto do Levi', 'w2', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', '2026-09-12', 3000, 'out', 'Mercado do casal', 'w3', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into recurrences (id, household_id, template, frequency, starts_on) values
  ('dec00000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', '{"account_id":"acc00000-0000-0000-0000-000000000005"}', 'monthly', '2026-09-01');
insert into net_worth_snapshots (household_id, account_id, date, balance_cents) values
  ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000005', '2026-09-30', 99900);
SQL
as_user $ESPOSA "delete from transactions where id = 'e1000000-0000-0000-0000-000000000001';" >/dev/null
check "ela não apaga lançamento dele" "$(admin "select count(*) from transactions where id='e1000000-0000-0000-0000-000000000001'")" "1"
as_user $ESPOSA "update transactions set account_id = 'acc00000-0000-0000-0000-000000000006' where id = 'e1000000-0000-0000-0000-000000000002';" >/dev/null
check "ela não puxa lançamento dele pra conta dela" "$(admin "select account_id from transactions where id='e1000000-0000-0000-0000-000000000002'")" "acc00000-0000-0000-0000-000000000005"
as_user $ESPOSA "update transactions set amount_cents = 1 where id = 'e1000000-0000-0000-0000-000000000002';" >/dev/null
check "ela não altera valor de lançamento dele" "$(admin "select amount_cents from transactions where id='e1000000-0000-0000-0000-000000000002'")" "7000"
as_user $ESPOSA "update accounts set owner_id = '$ESPOSA' where id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não vira dona da conta dele" "$(admin "select owner_id from accounts where id='acc00000-0000-0000-0000-000000000005'")" "$LEVI"
as_user $ESPOSA "update accounts set owner_id = null where id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não transforma a conta dele em conta do casal" "$(admin "select owner_id from accounts where id='acc00000-0000-0000-0000-000000000005'")" "$LEVI"
as_user $ESPOSA "update accounts set visibility = 'hidden' where id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não muda a visibilidade da conta dele" "$(admin "select visibility from accounts where id='acc00000-0000-0000-0000-000000000005'")" "shared"
as_user $ESPOSA "delete from accounts where id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não apaga a conta dele" "$(admin "select count(*) from accounts where id='acc00000-0000-0000-0000-000000000005'")" "1"
as_user $ESPOSA "update recurrences set template = '{\"account_id\":\"acc00000-0000-0000-0000-000000000006\"}' where id = 'dec00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não puxa recorrência dele" "$(admin "select template->>'account_id' from recurrences where id='dec00000-0000-0000-0000-000000000005'")" "acc00000-0000-0000-0000-000000000005"
as_user $ESPOSA "delete from net_worth_snapshots where account_id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "ela não apaga o histórico de saldo dele" "$(admin "select count(*) from net_worth_snapshots where account_id='acc00000-0000-0000-0000-000000000005'")" "1"
check "…mas continua VENDO tudo da conta aberta dele" "$(as_user $ESPOSA "select count(*) from transactions where account_id='acc00000-0000-0000-0000-000000000005';")" "2"

echo "o que precisa continuar funcionando:"
as_user $ESPOSA "update transactions set description = 'Mercado do casal (editado por ela)' where id = 'e1000000-0000-0000-0000-000000000003';" >/dev/null
check "ela edita lançamento da conta do casal" "$(admin "select description from transactions where id='e1000000-0000-0000-0000-000000000003'")" "Mercado do casal (editado por ela)"
as_user $LEVI "update transactions set amount_cents = 5500 where id = 'e1000000-0000-0000-0000-000000000001';" >/dev/null
check "Levi edita lançamento da própria conta" "$(admin "select amount_cents from transactions where id='e1000000-0000-0000-0000-000000000001'")" "5500"
as_user $LEVI "update accounts set visibility = 'balance_only' where id = 'acc00000-0000-0000-0000-000000000005';" >/dev/null
check "Levi muda a visibilidade da própria conta" "$(admin "select visibility from accounts where id='acc00000-0000-0000-0000-000000000005'")" "balance_only"
as_user $LEVI "delete from transactions where id = 'e1000000-0000-0000-0000-000000000001';" >/dev/null
check "Levi apaga lançamento da própria conta" "$(admin "select count(*) from transactions where id='e1000000-0000-0000-0000-000000000001'")" "0"
as_user $ESPOSA "insert into transactions (household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by) values ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000006', '2026-09-20', 8500, 'out', 'Spectrum', 'w4', '$ESPOSA');" >/dev/null
check "ela lança na própria conta" "$(admin "select count(*) from transactions where description='Spectrum'")" "1"

echo "cadastro do membro:"
as_user $ESPOSA "update members set display_name = 'Esposa (novo nome)', notifications_seen_at = now() where id = '$ESPOSA';" >/dev/null
check "ela muda o próprio nome e marca notificações" "$(admin "select display_name||' · '||(notifications_seen_at is not null)::text from members where id='$ESPOSA'")" "Esposa (novo nome) · true"
admin "update members set removed_at = now() where id = '$ESPOSA'"
as_user $ESPOSA "update members set removed_at = null where id = '$ESPOSA';" >/dev/null
check "removida, ela não apaga a própria remoção" "$(admin "select (removed_at is not null)::text from members where id='$ESPOSA'")" "true"
admin "update members set removed_at = null where id = '$ESPOSA'"
admin "insert into households (id, name) values ('33333333-0000-0000-0000-000000000003', 'Casa de outra pessoa')"
as_user $ESPOSA "update members set household_id = '33333333-0000-0000-0000-000000000003' where id = '$ESPOSA';" >/dev/null
check "ela não troca a própria casa por outra" "$(admin "select household_id from members where id='$ESPOSA'")" "11111111-0000-0000-0000-000000000001"

echo "mover recorrência:"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
-- Spectrum: recorrência na conta do casal, com 1 paga e 2 previstas
insert into recurrences (id, household_id, template, frequency, starts_on) values
  ('dec00000-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-000000000001',
   '{"account_id":"acc00000-0000-0000-0000-000000000002","description":"Spectrum","amount_cents":8500,"direction":"out"}', 'monthly', '2026-09-21');
insert into transactions (id, household_id, account_id, date, amount_cents, direction, description, status, recurrence_id, fingerprint, created_by) values
  ('e2000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', '2026-09-21', 8500, 'out', 'Spectrum', 'cleared', 'dec00000-0000-0000-0000-0000000000a1', 'sp-1', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('e2000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', '2026-10-21', 8500, 'out', 'Spectrum', 'pending', 'dec00000-0000-0000-0000-0000000000a1', 'sp-2', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('e2000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', '2026-11-21', 8500, 'out', 'Spectrum', 'pending', 'dec00000-0000-0000-0000-0000000000a1', 'sp-3', 'aaaaaaaa-0000-0000-0000-00000000000a');
SQL
check "Levi não empurra a despesa pra conta pessoal dela" "$(as_user $LEVI "select move_recurrence('dec00000-0000-0000-0000-0000000000a1', 'acc00000-0000-0000-0000-000000000006');" | grep -o 'Você não pode mover')" "Você não pode mover"
check "…e nada se moveu" "$(admin "select count(*) from transactions where recurrence_id='dec00000-0000-0000-0000-0000000000a1' and account_id='acc00000-0000-0000-0000-000000000002'")" "3"
check "mesma conta é recusada" "$(as_user $ESPOSA "select move_recurrence('dec00000-0000-0000-0000-0000000000a1', 'acc00000-0000-0000-0000-000000000002');" | grep -o 'já está nessa conta')" "já está nessa conta"
check "ela puxa a Spectrum pra conta dela" "$(as_user $ESPOSA "select move_recurrence('dec00000-0000-0000-0000-0000000000a1', 'acc00000-0000-0000-0000-000000000006');")" '{"moved": 2}'
check "…o modelo aponta pra conta dela" "$(admin "select template->>'account_id' from recurrences where id='dec00000-0000-0000-0000-0000000000a1'")" "acc00000-0000-0000-0000-000000000006"
check "…as duas previstas foram junto" "$(admin "select count(*) from transactions where recurrence_id='dec00000-0000-0000-0000-0000000000a1' and status='pending' and account_id='acc00000-0000-0000-0000-000000000006'")" "2"
check "…a já paga ficou na conta do casal" "$(admin "select account_id from transactions where id='e2000000-0000-0000-0000-000000000001'")" "acc00000-0000-0000-0000-000000000002"
check "…impressão digital recalculada pra conta nova" "$(admin "select bool_and(fingerprint = transaction_fingerprint(account_id, date, amount_cents, description))::text from transactions where recurrence_id='dec00000-0000-0000-0000-0000000000a1' and status='pending'")" "true"
check "…o resto do modelo intacto" "$(admin "select template->>'description'||' · '||(template->>'amount_cents') from recurrences where id='dec00000-0000-0000-0000-0000000000a1'")" "Spectrum · 8500"
check "conta dela oculta: Levi nem enxerga a recorrência" "$(as_user $LEVI "select move_recurrence('dec00000-0000-0000-0000-0000000000a1', 'acc00000-0000-0000-0000-000000000002');" | grep -o 'não encontrada')" "não encontrada"

echo "nomes limpos:"
admin "delete from transactions; delete from imports;"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', 'outubro.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into staged_transactions (import_id, date, description, bank_description, amount_cents, direction, fingerprint, is_included) values
  ('10000000-0000-0000-0000-000000000009', '2026-10-11', 'Fxreplay', 'Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889', 3500, 'out',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-10-11', 3500, 'Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889'), true);
SQL
as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000009');" >/dev/null
check "entra com o nome limpo e o texto do banco guardado" "$(admin "select description||' · '||bank_description from transactions where import_id='10000000-0000-0000-0000-000000000009'")" "Fxreplay · Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889"
check "impressão digital é a do texto do banco" "$(admin "select (fingerprint = transaction_fingerprint(account_id, date, amount_cents, bank_description))::text from transactions where import_id='10000000-0000-0000-0000-000000000009'")" "true"

as_user $LEVI "insert into merchant_names (household_id, member_id, bank_key, name) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'facebook', 'Anúncios');" >/dev/null
check "Levi guarda o nome que escolheu" "$(admin "select name from merchant_names where member_id='$LEVI'")" "Anúncios"
check "esposa não vê os nomes dele" "$(as_user $ESPOSA "select count(*) from merchant_names;")" "0"
as_user $ESPOSA "insert into merchant_names (household_id, member_id, bank_key, name) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'netflix', 'Filmes');" >/dev/null
check "esposa não grava nome no lugar dele" "$(admin "select count(*) from merchant_names where bank_key='netflix'")" "0"
as_user $ESPOSA "update merchant_names set name = 'trocado' where member_id = '$LEVI';" >/dev/null
check "esposa não troca nome dele" "$(admin "select name from merchant_names where member_id='$LEVI'")" "Anúncios"

echo "lançamentos importados antes desta versão:"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', 'antigo.pdf', 'pdf', 'confirmed', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into transactions (id, household_id, account_id, date, amount_cents, direction, description, notes, status, fingerprint, import_id, created_by) values
  -- importado e nunca mexido
  ('e3000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-09-11', 3500, 'out',
   'Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889', null, 'cleared',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-09-11', 3500, 'Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889'),
   '10000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  -- importado e renomeado depois (a impressão foi recalculada com o nome novo)
  ('e3000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-09-12', 900, 'out',
   'Café', null, 'cleared',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-09-12', 900, 'Café'),
   '10000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  -- previsão quitada: texto do banco na última linha da observação
  ('e3000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-09-22', 40000, 'in',
   'Sylaris Monthly', E'pago via Zelle\nZelle Credit From Sylaris, LLC Ref# 626500g0ie64', 'cleared',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-09-22', 40000, 'Zelle Credit From Sylaris, LLC Ref# 626500g0ie64'),
   '10000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  -- previsão quitada sem observação própria
  ('e3000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-09-24', 48000, 'out',
   'Car Monthly', 'Card Purchase Toyota Fin 6012 800-874-8822 TX 75024 9889', 'cleared',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-09-24', 48000, 'Card Purchase Toyota Fin 6012 800-874-8822 TX 75024 9889'),
   '10000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a');
SQL
sed -n '/\[preenche-antigos:início\]/,/\[preenche-antigos:fim\]/p' "$S"/../migrations/0018_clean_bank_names.sql > $D/backfill.sql
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 -f $D/backfill.sql
check "nunca mexido: texto do banco copiado" "$(admin "select bank_description from transactions where id='e3000000-0000-0000-0000-000000000001'")" "Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889"
# Renomeado antes desta versão: a impressão foi recalculada com o nome
# novo, então não dá pra distinguir de um nunca mexido. Fica com o nome
# como "texto do banco" — a impressão segue exatamente a mesma de antes.
check "renomeado antes: impressão segue a mesma" "$(admin "select (fingerprint = transaction_fingerprint(account_id, date, amount_cents, bank_description))::text from transactions where id='e3000000-0000-0000-0000-000000000002'")" "true"
check "quitada: texto sai da observação pra coluna" "$(admin "select bank_description||' | '||notes from transactions where id='e3000000-0000-0000-0000-000000000003'")" "Zelle Credit From Sylaris, LLC Ref# 626500g0ie64 | pago via Zelle"
check "quitada sem observação: observação fica vazia" "$(admin "select bank_description||' | '||coalesce(notes, 'vazia') from transactions where id='e3000000-0000-0000-0000-000000000004'")" "Card Purchase Toyota Fin 6012 800-874-8822 TX 75024 9889 | vazia"
check "rodar de novo não muda nada" "$(psql -h $D -p 54329 -U postgres -q -f $D/backfill.sql >/dev/null; admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-00000000000a' and bank_description is not null")" "4"

echo "país e fuso da casa:"
check "casa existente fica nos EUA, fuso de Orlando" "$(admin "select country||' · '||timezone from households where id='11111111-0000-0000-0000-000000000001'")" "US · America/New_York"
as_user $LEVI "update households set country = 'BR', timezone = 'America/Sao_Paulo', currency = 'BRL' where id = '11111111-0000-0000-0000-000000000001';" >/dev/null
check "membro troca país, fuso e moeda" "$(admin "select country||' · '||timezone||' · '||currency from households where id='11111111-0000-0000-0000-000000000001'")" "BR · America/Sao_Paulo · BRL"
check "fuso inexistente é recusado" "$(as_user $LEVI "update households set timezone = 'Lua/Base' where id = '11111111-0000-0000-0000-000000000001';" | grep -o 'time zone' | head -1)" "time zone"
check "país fora da lista é recusado" "$(as_user $LEVI "update households set country = 'XX' where id = '11111111-0000-0000-0000-000000000001';" | grep -o 'violates check' | head -1)" "violates check"
check "ninguém mexe na casa dos outros" "$(as_user $LEVI "update households set timezone = 'America/Chicago' where id = '33333333-0000-0000-0000-000000000003' returning id;" | grep -c 2222)" "0"

echo "cartão de crédito:"
admin "update households set country='US', timezone='America/New_York', currency='USD' where id='11111111-0000-0000-0000-000000000001'"
as_user $LEVI "insert into accounts (id, household_id, name, type, owner_id, visibility, credit_limit_cents, statement_close_day, payment_due_day, payment_account_id, last_four, card_color) values ('acc00000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'Cartão principal', 'credit_card', '$LEVI', 'balance_only', 300000, 28, 22, 'acc00000-0000-0000-0000-000000000002', '4821', 'ink');" >/dev/null
check "Levi cadastra o cartão dele" "$(admin "select name||' · '||last_four||' · '||statement_close_day||'/'||payment_due_day from accounts where id='acc00000-0000-0000-0000-0000000000c1'")" "Cartão principal · 4821 · 28/22"
check "dia de fechamento fora de 1–31 é recusado" "$(as_user $LEVI "update accounts set statement_close_day = 32 where id = 'acc00000-0000-0000-0000-0000000000c1';" | grep -o 'violates check' | head -1)" "violates check"
check "final com letras é recusado" "$(as_user $LEVI "update accounts set last_four = '48a1' where id = 'acc00000-0000-0000-0000-0000000000c1';" | grep -o 'violates check' | head -1)" "violates check"
check "cartão não paga a si mesmo" "$(as_user $LEVI "update accounts set payment_account_id = id where id = 'acc00000-0000-0000-0000-0000000000c1';" | grep -o 'violates check' | head -1)" "violates check"
as_user $ESPOSA "update accounts set credit_limit_cents = 999999 where id = 'acc00000-0000-0000-0000-0000000000c1';" >/dev/null
check "esposa não mexe no cartão dele" "$(admin "select credit_limit_cents from accounts where id='acc00000-0000-0000-0000-0000000000c1'")" "300000"
as_user $LEVI "select create_transfer('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', 'acc00000-0000-0000-0000-0000000000c1', '2026-11-22', 128430, 'Pagamento da fatura', null, '$LEVI', 'pf-1', 'pf-2');" >/dev/null
check "pagar a fatura vira transferência (sai do casal, entra no cartão)" "$(admin "select string_agg(direction::text, ',' order by direction) from transactions where description='Pagamento da fatura' and transfer_group_id is not null")" "in,out"

check "cartão com saldo inicial positivo é recusado" "$(as_user $LEVI "update accounts set opening_balance_cents = 2500 where id = 'acc00000-0000-0000-0000-0000000000c1';" | grep -o 'violates check' | head -1)" "violates check"
check "conta corrente com saldo positivo continua normal" "$(as_user $LEVI "update accounts set opening_balance_cents = 2500 where id = 'acc00000-0000-0000-0000-000000000002' returning opening_balance_cents;" | head -1)" "2500"

echo "extrato pagando a fatura:"
admin "update accounts set opening_balance_cents = 0 where id = 'acc00000-0000-0000-0000-000000000002'"
psql -h $D -p 54329 -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-0000000000b1', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', 'regions-nov.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into staged_transactions (import_id, date, description, bank_description, amount_cents, direction, fingerprint, is_included, card_payment_account_id, card_payment_accepted) values
  ('10000000-0000-0000-0000-0000000000b1', '2026-11-21', 'Pagamento da fatura · Cartão principal', 'Online Payment Thank You', 128430, 'out', 'fp-pay', true, 'acc00000-0000-0000-0000-0000000000c1', true),
  ('10000000-0000-0000-0000-0000000000b1', '2026-11-22', 'Card Payment', 'Card Payment', 5000, 'out', 'fp-pay-2', true, 'acc00000-0000-0000-0000-0000000000c1', false);
SQL
check "confirma" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-0000000000b1');")" '{"merged": 0, "inserted": 2}'
check "pagamento aceito vira transferência: sai da corrente, entra no cartão" "$(admin "select string_agg(a.type::text||':'||t.direction::text, ',' order by t.direction) from transactions t join accounts a on a.id = t.account_id where t.import_id='10000000-0000-0000-0000-0000000000b1' and t.transfer_group_id is not null")" "credit_card:in,checking:out"
check "a ponta da corrente guarda o texto do banco" "$(admin "select bank_description from transactions where import_id='10000000-0000-0000-0000-0000000000b1' and direction='out' and transfer_group_id is not null")" "Online Payment Thank You"
check "o pagamento ganha o nome do cartão" "$(admin "select string_agg(distinct description, ',') from transactions where import_id='10000000-0000-0000-0000-0000000000b1' and transfer_group_id is not null")" "Pagamento da fatura · Cartão principal"
check "pagamento recusado entra como lançamento comum" "$(admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-0000000000b1' and transfer_group_id is null and amount_cents = 5000")" "1"
check "desfazer apaga as duas pontas" "$(as_user $LEVI "select undo_import('10000000-0000-0000-0000-0000000000b1');" >/dev/null; admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-0000000000b1'")" "0"

echo "parcelado:"
as_user $LEVI "insert into transactions (household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by, installment_group_id, installment_number, installment_total) values ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-0000000000c1', '2026-10-10', 20000, 'out', 'Dentista', 'inst-1', '$LEVI', 'eeee0000-0000-0000-0000-000000000001', 1, 6);" >/dev/null
check "parcela 1 de 6 gravada" "$(admin "select installment_number||' de '||installment_total from transactions where fingerprint='inst-1'")" "1 de 6"
check "parcela 7 de 6 é recusada" "$(as_user $LEVI "insert into transactions (household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by, installment_group_id, installment_number, installment_total) values ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-0000000000c1', '2026-10-10', 20000, 'out', 'Dentista', 'inst-x', '$LEVI', 'eeee0000-0000-0000-0000-000000000001', 7, 6);" | grep -o 'violates check' | head -1)" "violates check"
check "parcela sem grupo é recusada" "$(as_user $LEVI "insert into transactions (household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by, installment_number, installment_total) values ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-0000000000c1', '2026-10-10', 20000, 'out', 'Dentista', 'inst-y', '$LEVI', 1, 6);" | grep -o 'violates check' | head -1)" "violates check"

echo "excluir conta do casal (aval dos dois):"
admin "insert into accounts (id, household_id, name, type) values ('acc00000-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-000000000001', 'Conta teste', 'checking'), ('acc00000-0000-0000-0000-0000000000d2', '11111111-0000-0000-0000-000000000001', 'Com historico', 'checking');"
admin "insert into transactions (household_id, account_id, date, amount_cents, direction, description, fingerprint, created_by) values ('11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-0000000000d2', '2026-10-01', 100, 'out', 'x', 'del-1', '$LEVI');"
admin "insert into recurrences (household_id, template, frequency, starts_on) values ('11111111-0000-0000-0000-000000000001', '{\"account_id\": \"acc00000-0000-0000-0000-0000000000d1\"}', 'monthly', '2026-10-01');"
as_user $LEVI "delete from accounts where id='acc00000-0000-0000-0000-0000000000d1';" >/dev/null
check "com dois na casa, delete direto da conta do casal não passa" "$(admin "select count(*) from accounts where id='acc00000-0000-0000-0000-0000000000d1'")" "1"
check "pedir com histórico é recusado" "$(as_user $LEVI "select request_account_deletion('acc00000-0000-0000-0000-0000000000d2');" | grep -o 'tem lançamentos')" "tem lançamentos"
check "pedir abre pedido" "$(as_user $LEVI "select request_account_deletion('acc00000-0000-0000-0000-0000000000d1');")" "requested"
check "segundo pedido igual é recusado" "$(as_user $LEVI "select request_account_deletion('acc00000-0000-0000-0000-0000000000d1');" | grep -o 'Já tem um pedido')" "Já tem um pedido"
REQ=$(admin "select id from account_deletion_requests where account_id='acc00000-0000-0000-0000-0000000000d1'")
check "esposa vê o pedido" "$(as_user $ESPOSA "select count(*) from account_deletion_requests;")" "1"
check "quem pediu não aprova" "$(as_user $LEVI "select approve_account_deletion('$REQ');" | grep -o 'não pode aprovar')" "não pode aprovar"
check "conta continua depois da tentativa" "$(admin "select count(*) from accounts where id='acc00000-0000-0000-0000-0000000000d1'")" "1"
as_user $ESPOSA "select decline_account_deletion('$REQ');" >/dev/null
check "esposa recusa" "$(admin "select status from account_deletion_requests where id='$REQ'")" "declined"
as_user $LEVI "select request_account_deletion('acc00000-0000-0000-0000-0000000000d1');" >/dev/null
REQ2=$(admin "select id from account_deletion_requests where account_id='acc00000-0000-0000-0000-0000000000d1' and status='pending'")
as_user $ESPOSA "select approve_account_deletion('$REQ2');" >/dev/null
check "esposa aprova: conta sai" "$(admin "select count(*) from accounts where id='acc00000-0000-0000-0000-0000000000d1'")" "0"
check "recorrência da conta sai junto" "$(admin "select count(*) from recurrences where template->>'account_id'='acc00000-0000-0000-0000-0000000000d1'")" "0"
check "conta pessoal: dono exclui direto" "$(admin "insert into accounts (id, household_id, name, type, owner_id, visibility) values ('acc00000-0000-0000-0000-0000000000d3', '11111111-0000-0000-0000-000000000001', 'Minha', 'checking', '$LEVI', 'hidden');"; as_user $LEVI "delete from accounts where id='acc00000-0000-0000-0000-0000000000d3';" >/dev/null; admin "select count(*) from accounts where id='acc00000-0000-0000-0000-0000000000d3'")" "0"
check "casa de um membro: pedir exclui na hora" "$(admin "insert into auth.users (id) values ('dddddddd-0000-0000-0000-00000000000d'); insert into households (id, name) values ('44444444-0000-0000-0000-000000000004', 'Solo'); insert into members (id, household_id, display_name, color) values ('dddddddd-0000-0000-0000-00000000000d', '44444444-0000-0000-0000-000000000004', 'Solo', '#222'); insert into accounts (id, household_id, name, type) values ('acc00000-0000-0000-0000-0000000000d4', '44444444-0000-0000-0000-000000000004', 'Solo conta', 'checking');"; as_user dddddddd-0000-0000-0000-00000000000d "select request_account_deletion('acc00000-0000-0000-0000-0000000000d4');")" "deleted"

echo "apagar transações zera saldo inicial:"
admin "insert into accounts (id, household_id, name, type, opening_balance_cents) values ('acc00000-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001', 'Casal com saldo', 'checking', 150000); insert into accounts (id, household_id, name, type, opening_balance_cents, owner_id, visibility) values ('acc00000-0000-0000-0000-0000000000e2', '11111111-0000-0000-0000-000000000001', 'Cartao do Levi', 'credit_card', -32000, '$LEVI', 'hidden'), ('acc00000-0000-0000-0000-0000000000e3', '11111111-0000-0000-0000-000000000001', 'Da esposa', 'checking', 9900, '$ESPOSA', 'hidden');"
as_user $LEVI "update accounts set opening_balance_cents = 0 where household_id='11111111-0000-0000-0000-000000000001' and opening_balance_cents <> 0;" >/dev/null
check "conta do casal zerada" "$(admin "select opening_balance_cents from accounts where id='acc00000-0000-0000-0000-0000000000e1'")" "0"
check "cartão próprio zerado (regra do cartão aceita 0)" "$(admin "select opening_balance_cents from accounts where id='acc00000-0000-0000-0000-0000000000e2'")" "0"
check "conta pessoal da outra pessoa não é tocada" "$(admin "select opening_balance_cents from accounts where id='acc00000-0000-0000-0000-0000000000e3'")" "9900"

echo "categoria lembrada por estabelecimento:"
as_user $LEVI "insert into merchant_categories (household_id, member_id, bank_key, direction, category_id) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'publix', 'out', 'ca700000-0000-0000-0000-00000000000a');" >/dev/null
check "Levi guarda a categoria do Publix" "$(admin "select count(*) from merchant_categories where member_id='$LEVI' and bank_key='publix'")" "1"
check "esposa não vê as categorias lembradas dele" "$(as_user $ESPOSA "select count(*) from merchant_categories;")" "0"
as_user $ESPOSA "insert into merchant_categories (household_id, member_id, bank_key, direction, category_id) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'target', 'out', 'ca700000-0000-0000-0000-00000000000a');" >/dev/null
check "esposa não grava no lugar dele" "$(admin "select count(*) from merchant_categories where bank_key='target'")" "0"
admin "insert into categories (id, household_id, name, kind, color) values ('ca700000-0000-0000-0000-0000000000f1', '44444444-0000-0000-0000-000000000004', 'De outra casa', 'expense', '#000');"
as_user $LEVI "insert into merchant_categories (household_id, member_id, bank_key, direction, category_id) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'costco', 'out', 'ca700000-0000-0000-0000-0000000000f1');" >/dev/null
check "categoria de outra casa não entra" "$(admin "select count(*) from merchant_categories where bank_key='costco'")" "0"
as_user $LEVI "insert into merchant_categories (household_id, member_id, bank_key, direction, category_id) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'publix', 'in', 'ca700000-0000-0000-0000-00000000000e');" >/dev/null
check "mesma loja, direção diferente, lembra separado" "$(admin "select count(*) from merchant_categories where bank_key='publix'")" "2"

echo "categoria entre contas:"
check "categoria nova não é de transferência por padrão" "$(admin "select is_transfer::text from categories where id='ca700000-0000-0000-0000-00000000000a'")" "false"
as_user $LEVI "insert into categories (household_id, name, kind, color, is_transfer) values ('11111111-0000-0000-0000-000000000001', 'Transferência', 'expense', '#000', true);" >/dev/null
check "dá pra criar a de transferência" "$(admin "select count(*) from categories where name='Transferência' and is_transfer")" "1"

echo "metas:"
as_user $LEVI "insert into goals (id, household_id, owner_id, kind, name, target_cents, target_date) values ('90000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', null, 'save', 'Viagem', 500000, '2027-07-31');" >/dev/null
as_user $LEVI "insert into goals (id, household_id, owner_id, kind, name, target_cents) values ('90000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '$LEVI', 'save', 'Reserva', 600000);" >/dev/null
check "esposa vê a meta do casal, não a pessoal oculta dele" "$(as_user $ESPOSA "select string_agg(name, ',' order by name) from goals where name like 'Viagem%' or name = 'Reserva';")" "Viagem,Viagem da família"
as_user $LEVI "update goals set visibility = 'shared' where id = '90000000-0000-0000-0000-000000000002';" >/dev/null
check "liberada, ela vê" "$(as_user $ESPOSA "select count(*) from goals where name = 'Reserva';")" "1"
as_user $ESPOSA "update goals set name = 'Mexi' where id = '90000000-0000-0000-0000-000000000002';" >/dev/null
check "ela não mexe na meta pessoal dele" "$(admin "select name from goals where id='90000000-0000-0000-0000-000000000002'")" "Reserva"
as_user $ESPOSA "insert into goal_deposits (household_id, goal_id, amount_cents) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 1000);" >/dev/null
check "nem guarda valor nela" "$(admin "select count(*) from goal_deposits where goal_id='90000000-0000-0000-0000-000000000002'")" "0"
as_user $ESPOSA "insert into goal_deposits (household_id, goal_id, amount_cents) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 2000);" >/dev/null
check "na do casal, guarda" "$(admin "select sum(amount_cents) from goal_deposits where goal_id='90000000-0000-0000-0000-000000000001'")" "2000"
as_user $ESPOSA "insert into goals (household_id, owner_id, kind, name, target_cents) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'save', 'No nome dele', 100);" >/dev/null
check "ninguém cria meta no nome do outro" "$(admin "select count(*) from goals where name='No nome dele'")" "0"
as_user $LEVI "insert into goals (household_id, kind, name, target_cents) values ('11111111-0000-0000-0000-000000000001', 'limit', 'Sem categoria', 100);" >/dev/null 2>&1
check "limite precisa de categoria" "$(admin "select count(*) from goals where kind='limit'")" "0"
as_user $LEVI "insert into goals (household_id, kind, name, target_cents, category_id) values ('11111111-0000-0000-0000-000000000001', 'limit', 'Outra casa', 100, 'ca700000-0000-0000-0000-0000000000f1');" >/dev/null 2>&1
check "categoria de outra casa não entra" "$(admin "select count(*) from goals where name='Outra casa'")" "0"
as_user $LEVI "update goals set visibility = 'hidden' where id = '90000000-0000-0000-0000-000000000002';" >/dev/null
as_user $LEVI "insert into goal_deposits (household_id, goal_id, amount_cents) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 5000);" >/dev/null
check "oculta de novo, ela não vê os depósitos dele" "$(as_user $ESPOSA "select count(*) from goal_deposits;")" "1"

as_user $LEVI "insert into goals (household_id, owner_id, kind, name, target_cents, tracking, account_id) values ('11111111-0000-0000-0000-000000000001', null, 'save', 'Casal na conta dele', 100, 'account', 'acc00000-0000-0000-0000-000000000001');" >/dev/null 2>&1
check "meta do casal não segue conta pessoal" "$(admin "select count(*) from goals where name='Casal na conta dele'")" "0"
as_user $LEVI "insert into goals (household_id, owner_id, kind, name, target_cents, tracking, account_id) values ('11111111-0000-0000-0000-000000000001', '$LEVI', 'save', 'Minha na minha', 100, 'account', 'acc00000-0000-0000-0000-000000000001');" >/dev/null 2>&1
check "a minha segue a minha conta" "$(admin "select count(*) from goals where name='Minha na minha'")" "1"

echo "metas: vincular lançamento:"
admin "insert into transactions (id, household_id, account_id, date, amount_cents, direction, description, status, fingerprint, created_by) values ('f0000000-0000-0000-0000-0000000000c2', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', '2026-10-02', 40000, 'out', 'Pagamento pessoal', 'cleared', 'fp-pessoal', '$LEVI');" >/dev/null
admin "insert into transactions (id, household_id, account_id, date, amount_cents, direction, description, status, fingerprint, created_by) values ('f0000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', '2026-10-01', 30000, 'out', 'Parcela empréstimo', 'cleared', 'fp-parcela', '$LEVI');" >/dev/null
as_user $LEVI "insert into goal_deposits (household_id, goal_id, amount_cents, transaction_id) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 40000, 'f0000000-0000-0000-0000-0000000000c2');" >/dev/null 2>&1
check "meta do casal não vincula lançamento da conta pessoal" "$(admin "select count(*) from goal_deposits where transaction_id='f0000000-0000-0000-0000-0000000000c2'")" "0"
as_user $LEVI "insert into goal_deposits (household_id, goal_id, amount_cents, transaction_id) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 40000, 'f0000000-0000-0000-0000-0000000000c2');"
check "a minha vincula da minha conta" "$(admin "select count(*) from goal_deposits where transaction_id='f0000000-0000-0000-0000-0000000000c2'")" "1"
as_user $ESPOSA "insert into goal_deposits (household_id, goal_id, amount_cents, transaction_id) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 30000, 'f0000000-0000-0000-0000-0000000000c1');" >/dev/null 2>&1
check "conjunta na meta do casal: vincula" "$(admin "select count(*) from goal_deposits where transaction_id='f0000000-0000-0000-0000-0000000000c1'")" "1"
as_user $ESPOSA "insert into goal_deposits (household_id, goal_id, amount_cents, transaction_id) values ('11111111-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 30000, 'f0000000-0000-0000-0000-0000000000c1');" >/dev/null 2>&1
check "o mesmo lançamento não entra duas vezes" "$(admin "select count(*) from goal_deposits where transaction_id='f0000000-0000-0000-0000-0000000000c1'")" "1"
admin "delete from transactions where id='f0000000-0000-0000-0000-0000000000c1';" >/dev/null
check "apagou o lançamento, sai da meta" "$(admin "select count(*) from goal_deposits where transaction_id='f0000000-0000-0000-0000-0000000000c1'")" "0"

echo "subcategorias:"
H=11111111-0000-0000-0000-000000000001
admin "insert into categories (id, household_id, name, kind, color) values ('50b00000-0000-0000-0000-000000000001', '$H', 'Transporte', 'expense', ''), ('50b00000-0000-0000-0000-000000000003', '$H', 'Mercado', 'expense', '');" >/dev/null
as_user $LEVI "insert into categories (id, household_id, name, kind, color, parent_id) values ('50b00000-0000-0000-0000-000000000002', '$H', 'Gasolina', 'expense', '', '50b00000-0000-0000-0000-000000000001');" >/dev/null
check "cria sub" "$(admin "select count(*) from categories where parent_id='50b00000-0000-0000-0000-000000000001'")" "1"
as_user $LEVI "insert into categories (household_id, name, kind, color, parent_id) values ('$H', 'Sub da sub', 'expense', '', '50b00000-0000-0000-0000-000000000002');" >/dev/null 2>&1
check "um nível só" "$(admin "select count(*) from categories where name='Sub da sub'")" "0"
as_user $LEVI "insert into categories (household_id, name, kind, color, parent_id) values ('$H', 'Receita na despesa', 'income', '', '50b00000-0000-0000-0000-000000000001');" >/dev/null 2>&1
check "mesmo tipo da principal" "$(admin "select count(*) from categories where name='Receita na despesa'")" "0"
as_user $LEVI "update categories set parent_id = '50b00000-0000-0000-0000-000000000003' where id = '50b00000-0000-0000-0000-000000000001';" >/dev/null 2>&1
check "quem tem sub não vira sub" "$(admin "select parent_id is null from categories where id='50b00000-0000-0000-0000-000000000001'")" "t"
admin "insert into transactions (id, household_id, account_id, category_id, date, amount_cents, direction, description, status, fingerprint, created_by) values ('f0000000-0000-0000-0000-0000000000d1', '$H', 'acc00000-0000-0000-0000-000000000001', '50b00000-0000-0000-0000-000000000002', '2026-10-03', 4000, 'out', 'Shell', 'cleared', 'fp-shell', '$LEVI');" >/dev/null
as_user $ESPOSA "delete from categories where id = '50b00000-0000-0000-0000-000000000002';" >/dev/null
check "apagou a sub: lançamento (até de conta pessoal do outro) sobe pra principal" "$(admin "select category_id from transactions where id='f0000000-0000-0000-0000-0000000000d1'")" "50b00000-0000-0000-0000-000000000001"

echo "recorrências continuam:"
A1=acc00000-0000-0000-0000-000000000001
TODAY=$(admin "select (now() at time zone timezone)::date from households where id='$H'")
# Mensal dia 31, criada há mais de um ano: a última prevista ficou no passado.
admin "insert into recurrences (id, household_id, template, frequency, day_of_month, starts_on) values ('7ec00000-0000-0000-0000-000000000001', '$H', '{\"account_id\":\"$A1\",\"category_id\":\"ca700000-0000-0000-0000-00000000000a\",\"direction\":\"out\",\"amount_cents\":170000,\"description\":\"Aluguel\",\"notes\":null}', 'monthly', 31, '2025-01-31');" >/dev/null
admin "insert into transactions (household_id, account_id, date, amount_cents, direction, description, status, recurrence_id, fingerprint, created_by) values ('$H', '$A1', '2025-12-31', 170000, 'out', 'Aluguel', 'cleared', '7ec00000-0000-0000-0000-000000000001', 'fp-aluguel', '$LEVI');" >/dev/null
# Semanal com uma ocorrência apagada no meio (hoje+14 dias não existe).
admin "insert into recurrences (id, household_id, template, frequency, starts_on) values ('7ec00000-0000-0000-0000-000000000002', '$H', '{\"account_id\":\"$A1\",\"category_id\":\"ca7fffff-0000-0000-0000-000000000000\",\"direction\":\"in\",\"amount_cents\":5000,\"description\":\"Mesada\",\"notes\":null}', 'weekly', '$TODAY'::date - 70);" >/dev/null
admin "insert into transactions (household_id, account_id, date, amount_cents, direction, description, status, recurrence_id, fingerprint, created_by) select '$H', '$A1', d, 5000, 'in', 'Mesada', 'pending', '7ec00000-0000-0000-0000-000000000002', 'fp-mesada', '$LEVI' from (values ('$TODAY'::date + 7), ('$TODAY'::date + 21)) v(d);" >/dev/null
# Termina daqui a 2 meses; e uma desativada.
admin "insert into recurrences (id, household_id, template, frequency, day_of_month, starts_on, ends_on) values ('7ec00000-0000-0000-0000-000000000003', '$H', '{\"account_id\":\"$A1\",\"direction\":\"out\",\"amount_cents\":999,\"description\":\"Netflix\"}', 'monthly', 5, '2025-01-05', '$TODAY'::date + 60);" >/dev/null
admin "insert into recurrences (id, household_id, template, frequency, day_of_month, starts_on, is_active) values ('7ec00000-0000-0000-0000-000000000004', '$H', '{\"account_id\":\"$A1\",\"direction\":\"out\",\"amount_cents\":1500,\"description\":\"Spotify\"}', 'monthly', 10, '2025-01-10', false);" >/dev/null
admin "insert into transactions (household_id, account_id, date, amount_cents, direction, description, status, recurrence_id, fingerprint, created_by) values ('$H', '$A1', '2025-03-05', 999, 'out', 'Netflix', 'cleared', '7ec00000-0000-0000-0000-000000000003', 'fp-n', '$LEVI'), ('$H', '$A1', '2025-03-10', 1500, 'out', 'Spotify', 'cleared', '7ec00000-0000-0000-0000-000000000004', 'fp-s', '$LEVI');" >/dev/null
admin "select top_up_recurrences();" >/dev/null
R1="recurrence_id='7ec00000-0000-0000-0000-000000000001'"
check "mensal: nada criado no passado" "$(admin "select count(*) from transactions where $R1 and status='pending' and date < '$TODAY'")" "0"
check "mensal: 12 meses à frente" "$(admin "select count(*) between 12 and 13 from transactions where $R1 and status='pending'")" "t"
check "mensal: chega até um ano" "$(admin "select max(date) > '$TODAY'::date + 330 from transactions where $R1")" "t"
check "mensal: dia 31 cai no último dia do mês" "$(admin "select count(*) from transactions where $R1 and status='pending' and extract(day from date) <> least(31, extract(day from date_trunc('month', date) + interval '1 month - 1 day'))")" "0"
check "usa valor, categoria e impressão certos" "$(admin "select count(*) from transactions where $R1 and status='pending' and (amount_cents <> 170000 or category_id <> 'ca700000-0000-0000-0000-00000000000a' or fingerprint <> transaction_fingerprint(account_id, date, amount_cents, description) or created_by <> '$LEVI')")" "0"
R2="recurrence_id='7ec00000-0000-0000-0000-000000000002'"
check "semanal: a apagada no meio não volta" "$(admin "select count(*) from transactions where $R2 and date = '$TODAY'::date + 14")" "0"
check "semanal: continua depois da última, de 7 em 7 dias" "$(admin "select count(*) from transactions where $R2 and date > '$TODAY'::date + 21 and (date - ('$TODAY'::date - 70)) % 7 <> 0")/$(admin "select count(*) > 45 from transactions where $R2")" "0/t"
check "categoria que não existe vira sem categoria" "$(admin "select count(*) from transactions where $R2 and date > '$TODAY'::date + 21 and category_id is not null")" "0"
check "respeita o Termina em" "$(admin "select count(*) from transactions where recurrence_id='7ec00000-0000-0000-0000-000000000003' and date > '$TODAY'::date + 60")/$(admin "select count(*) >= 1 from transactions where recurrence_id='7ec00000-0000-0000-0000-000000000003' and status='pending'")" "0/t"
check "desativada não ganha nada" "$(admin "select count(*) from transactions where recurrence_id='7ec00000-0000-0000-0000-000000000004'")" "1"
BEFORE=$(admin "select count(*) from transactions where recurrence_id is not null")
admin "select top_up_recurrences();" >/dev/null
check "rodar de novo não duplica" "$(admin "select count(*) from transactions where recurrence_id is not null")" "$BEFORE"
check "usuário do app não chama a rotina" "$(as_user $LEVI "select top_up_recurrences();" | grep -c 'permission denied')" "1"

echo; [ $FAIL = 0 ] && echo "TUDO PASSOU" || echo "HÁ FALHAS"
su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
exit $FAIL
