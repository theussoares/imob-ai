-- Rollback da 0036.
--
-- ⚠️ Devolve a `authenticated` o privilégio de escrita na trilha de auditoria e
-- no recurso pago. Hoje a RLS ainda barra (não há policy de escrita nas duas),
-- então reverter não abre nada sozinho — o que ele faz é remover a SEGUNDA
-- barreira, deixando tudo dependendo de ninguém acrescentar uma policy
-- `for all` a essas tabelas.

grant insert, update, delete, truncate on public.portal_document_access to authenticated;
grant insert, update, delete, truncate on public.tenant_features to authenticated;
