-- Ícone manual por categoria (avatar colorido em Transações). NULL
-- mantém o fallback automático por palavra-chave do nome da categoria.
alter table categories add column icon text;
