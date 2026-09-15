-- Rollback da 0033.
--
-- Derrubar a coluna reabre o endpoint de recuperação de senha para abuso —
-- inclusive o esgotamento da cota diária de envio, que afeta TODOS os tenants,
-- não só o abusado. Só reverter junto com o código que a consulta.

alter table public.portal_users
  drop column if exists last_recovery_at;
