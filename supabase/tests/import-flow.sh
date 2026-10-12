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
check "observação: a sua, depois a do banco" "$(admin "select replace(notes, E'\n', ' / ') from transactions where id='$SYL'")" "pago via Zelle / Zelle Credit From Sylaris, LLC Ref# 626500g0ie64"
check "snapshot guarda estado pendente" "$(admin "select match_previous->>'status' from staged_transactions where match_previous is not null")" "pending"
check "snapshot guarda impressão" "$(admin "select (match_previous ? 'fingerprint')::text from staged_transactions where match_previous is not null")" "true"
check "segundo clique recusado" "$(as_user $LEVI "select confirm_import('10000000-0000-0000-0000-000000000001');" | grep -o 'já foi confirmada')" "já foi confirmada"
check "segundo clique não duplica" "$(admin "select count(*) from transactions where import_id='10000000-0000-0000-0000-000000000001'")" "3"

echo "desfazer:"
check "desfaz" "$(as_user $LEVI "select undo_import('10000000-0000-0000-0000-000000000001');")" '{"deleted": 2, "restored": 1}'
check "Sylaris volta a previsão" "$(admin "select status||' · '||notes from transactions where id='$SYL'")" "pending · pago via Zelle"
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
insert into goals (household_id, name, target_cents, linked_account_id) values
  ('11111111-0000-0000-0000-000000000001', 'Fundo secreto', 500000, 'acc00000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000001', 'Viagem da família', 300000, null);
SQL
check "esposa: só a importação da conjunta" "$(as_user $ESPOSA "select string_agg(file_path, ',' order by file_path) from imports;")" "conjunta.pdf"
check "esposa: só a linha da conjunta" "$(as_user $ESPOSA "select string_agg(description, ',' order by description) from staged_transactions;")" "Mercado"
check "esposa: não vê saldo da conta oculta" "$(as_user $ESPOSA "select count(*) from net_worth_snapshots;")" "0"
check "esposa: só a meta da casa" "$(as_user $ESPOSA "select string_agg(name, ',' order by name) from goals;")" "Viagem da família"
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

echo; [ $FAIL = 0 ] && echo "TUDO PASSOU" || echo "HÁ FALHAS"
su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
exit $FAIL
