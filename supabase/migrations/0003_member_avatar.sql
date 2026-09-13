-- Foto de perfil do membro (tela Configurações). O bucket de storage
-- "avatars" (público, leitura por URL) já foi criado via API — só a
-- coluna que guarda a URL pública precisa dessa migração.
alter table members add column avatar_url text;
