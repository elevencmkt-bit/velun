-- A tabela `members` só tinha policy de SELECT — qualquer UPDATE (ex.:
-- salvar nome/foto em Configurações) era bloqueado pelo RLS em
-- silêncio: o Supabase retorna sucesso com zero linhas afetadas, sem
-- erro, então a escrita nunca "quebrava" visivelmente, só não gravava.
-- Cada membro só pode editar a própria linha.
create policy members_update on members
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
