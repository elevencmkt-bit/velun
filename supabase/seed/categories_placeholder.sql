-- Categorias de EXEMPLO, só para não subir o app com a tela vazia.
-- Seção 9 da spec: a lista real ainda precisa ser decidida em conjunto
-- (12–20 categorias de despesa, no vocabulário do casal). Substituir
-- antes de importar qualquer extrato de verdade — category_rules
-- aprendidas vão apontar para o id destas categorias.

-- Uso: substituir :household_id pelo id real do household antes de rodar.

insert into categories (household_id, name, kind, color) values
  (:'household_id', 'Salário', 'income', '#2F6B4F'),
  (:'household_id', 'Outras receitas', 'income', '#2F6B4F'),
  (:'household_id', 'Mercado', 'expense', '#B2402F'),
  (:'household_id', 'Restaurante', 'expense', '#B2402F'),
  (:'household_id', 'Moradia', 'expense', '#B2402F'),
  (:'household_id', 'Transporte', 'expense', '#B2402F'),
  (:'household_id', 'Saúde', 'expense', '#B2402F'),
  (:'household_id', 'Lazer', 'expense', '#B2402F'),
  (:'household_id', 'Assinaturas', 'expense', '#B2402F'),
  (:'household_id', 'Compras', 'expense', '#B2402F'),
  (:'household_id', 'Outros', 'expense', '#B2402F');
