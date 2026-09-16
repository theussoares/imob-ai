-- Rollback da 0035. Só tira o link do site; não afeta acesso ao portal.
alter table public.tenants drop column if exists portal_enabled;
