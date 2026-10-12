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
admin "insert into households (id, name) values ('22222222-0000-0000-0000-000000000002', 'Casa de outra pessoa')"
as_user $ESPOSA "update members set household_id = '22222222-0000-0000-0000-000000000002' where id = '$ESPOSA';" >/dev/null
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
check "ninguém mexe na casa dos outros" "$(as_user $LEVI "update households set timezone = 'America/Chicago' where id = '22222222-0000-0000-0000-000000000002' returning id;" | grep -c 2222)" "0"

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

echo; [ $FAIL = 0 ] && echo "TUDO PASSOU" || echo "HÁ FALHAS"
su postgres -c "$B/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
exit $FAIL
