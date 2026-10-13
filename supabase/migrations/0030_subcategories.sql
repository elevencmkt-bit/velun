-- ---------------------------------------------------------------------------
-- Subcategorias: Categoria › Sub, um nível só
-- ---------------------------------------------------------------------------
--
-- A coluna parent_id existe desde a 0001 mas nunca foi usada. Aqui ela
-- ganha as regras:
--
-- - um nível só: a categoria principal não pode ser sub de outra, e uma
--   categoria que já tem subs não pode virar sub;
-- - mesma casa e mesmo tipo (despesa com despesa, receita com receita);
-- - movimentação entre contas (is_transfer) fica fora: não tem nem é sub.
--
-- E apagar uma sub não deixa nada "sem categoria": os lançamentos, as
-- recorrências, a memória por estabelecimento e as metas de limite que
-- usavam a sub passam pra categoria principal.

create index if not exists categories_parent_id_idx on categories (parent_id);

create or replace function categories_check_parent() returns trigger
language plpgsql as $$
declare
  p categories%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Uma categoria não pode ser sub dela mesma.';
  end if;
  select * into p from categories where id = new.parent_id;
  if not found or p.household_id <> new.household_id then
    raise exception 'Categoria principal inválida.';
  end if;
  if p.parent_id is not null then
    raise exception 'Subcategoria não pode ter subcategoria: é um nível só.';
  end if;
  if p.is_transfer or new.is_transfer then
    raise exception 'Movimentação entre contas não tem subcategoria.';
  end if;
  if p.kind <> new.kind then
    raise exception 'A sub precisa ser do mesmo tipo da categoria principal.';
  end if;
  if exists (select 1 from categories c where c.parent_id = new.id) then
    raise exception 'Esta categoria tem subcategorias e não pode virar sub de outra.';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_parent_check on categories;
create trigger categories_parent_check
  before insert or update of parent_id, kind, is_transfer on categories
  for each row execute function categories_check_parent();

-- Apagar uma sub: o que usava ela sobe pra principal. SECURITY DEFINER
-- porque os lançamentos podem estar em conta pessoal do outro membro
-- (que quem apaga não edita); a mudança é só de sub pra principal, dentro
-- da mesma casa, então não expõe nada.
create or replace function categories_move_to_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.parent_id is null then
    return old;
  end if;
  update transactions set category_id = old.parent_id where category_id = old.id;
  update staged_transactions set suggested_category_id = old.parent_id where suggested_category_id = old.id;
  update recurrences
    set template = jsonb_set(template, '{category_id}', to_jsonb(old.parent_id::text))
    where household_id = old.household_id and template->>'category_id' = old.id::text;
  update goals set category_id = old.parent_id where category_id = old.id;
  update merchant_categories set category_id = old.parent_id where category_id = old.id;
  return old;
end;
$$;

drop trigger if exists categories_sub_delete on categories;
create trigger categories_sub_delete
  before delete on categories
  for each row execute function categories_move_to_parent();
