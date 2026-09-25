-- Rollback da 0047: devolve ao `anon` o SELECT na tabela `tenants` inteira.
--
-- Seguro a qualquer momento — o código lê só `TENANT_PUBLIC_COLUMNS`, que é um
-- subconjunto do que volta a ser legível. Reabre a leitura de `updated_by` e
-- `ai_tone` pela anon key.

revoke select on public.tenants from anon;
grant select on public.tenants to anon;
