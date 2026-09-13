-- Guarda o email de quem foi convidado (novo fluxo "Convidar pessoa"
-- por email, além do link avulso). Puramente informativo por enquanto
-- — o envio do email em si ainda não está automatizado.
alter table household_invites add column email text;
