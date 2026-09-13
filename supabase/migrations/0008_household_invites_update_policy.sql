-- household_invites só tinha select/insert/delete — faltava update,
-- usado por ensureInvite() para gravar o email num convite já
-- existente. Mesma classe de bug já vista em members e households: RLS
-- bloqueia em silêncio (zero linhas afetadas, sem erro).
create policy household_invites_update on household_invites
  for update
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
