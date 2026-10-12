-- Monta o cenário como administrador (fora do RLS).
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a'), ('bbbbbbbb-0000-0000-0000-00000000000b');
insert into households (id, name) values ('11111111-0000-0000-0000-000000000001', 'Casa');
insert into members (id, household_id, display_name, color) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'Levi', '#000'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000001', 'Esposa', '#111');

-- Conta pessoal do Levi, visível pra esposa só como saldo.
insert into accounts (id, household_id, name, type, owner_id, visibility) values
  ('acc00000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Regions Business', 'checking',
   'aaaaaaaa-0000-0000-0000-00000000000a', 'balance_only');

insert into categories (id, household_id, name, kind, color) values
  ('ca700000-0000-0000-0000-00000000000e', '11111111-0000-0000-0000-000000000001', 'Salário', 'income', '#0f0'),
  ('ca700000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'Assinaturas', 'expense', '#f00');

insert into recurrences (id, household_id, template, frequency, starts_on) values
  ('dec00000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   jsonb_build_object('account_id', 'acc00000-0000-0000-0000-000000000001'), 'monthly', '2026-09-22');

-- Previsão do Sylaris, com observação própria.
insert into transactions (id, household_id, account_id, category_id, date, amount_cents, direction,
  description, notes, status, recurrence_id, fingerprint, created_by) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001',
   'ca700000-0000-0000-0000-00000000000e', '2026-09-22', 40000, 'in', 'Sylaris Monthly', 'pago via Zelle', 'pending',
   'dec00000-0000-0000-0000-000000000001',
   transaction_fingerprint('acc00000-0000-0000-0000-000000000001', '2026-09-22', 40000, 'Sylaris Monthly'),
   'aaaaaaaa-0000-0000-0000-00000000000a');

-- Importação em revisão: 1 que quita o Sylaris + 2 Stltones idênticos + 1 desmarcada.
insert into imports (id, household_id, account_id, file_path, file_type, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001',
   'setembro.pdf', 'pdf', 'review', 'aaaaaaaa-0000-0000-0000-00000000000a');

insert into staged_transactions (import_id, date, description, amount_cents, direction, suggested_category_id,
  fingerprint, match_transaction_id, merge_accepted, is_included) values
  ('10000000-0000-0000-0000-000000000001', '2026-09-22', 'Zelle Credit From Sylaris, LLC Ref# 626500g0ie64', 40000, 'in', null,
   'fp-sylaris-banco', 'f0000000-0000-0000-0000-000000000001', true, true),
  ('10000000-0000-0000-0000-000000000001', '2026-09-02', 'Sp Stltones.Com', 1499, 'out', 'ca700000-0000-0000-0000-00000000000a',
   'fp-stl', null, true, true),
  ('10000000-0000-0000-0000-000000000001', '2026-09-02', 'Sp Stltones.Com', 1499, 'out', 'ca700000-0000-0000-0000-00000000000a',
   'fp-stl', null, true, true),
  ('10000000-0000-0000-0000-000000000001', '2026-09-05', 'Linha desmarcada', 500, 'out', null,
   'fp-off', null, true, false);
