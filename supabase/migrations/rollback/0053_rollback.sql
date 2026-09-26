-- Rollback da 0053. A lista de Clientes volta a não distinguir convidado de
-- quem já entrou (o código trata a coluna ausente como "nunca entrou").
alter table public.portal_users drop column if exists first_login_at;
