-- Fecha a escrita pública direta em `leads`.
--
-- A anon key é pública (vai no HTML de toda página). Com a policy
-- `leads_public_insert ... with check (true)`, qualquer pessoa postava direto em
-- /rest/v1/leads e pulava TODAS as validações da API (nome, telefone, tamanho,
-- limite de volume) — verificado na prática: o insert respondia 201.
--
-- A partir daqui a gravação passa obrigatoriamente por POST /api/leads, que usa
-- a service_role no servidor (ver server/utils/supabase.ts -> serviceSupabase).
--
-- ⚠️ ORDEM IMPORTA: a variável SUPABASE_SERVICE_ROLE_KEY precisa existir na
-- Vercel e o deploy com o novo código precisa estar no ar ANTES de rodar isto.
-- Rodar antes deixa o formulário de contato quebrado no intervalo.
--
-- Este é o padrão para TODO formulário público novo: a tabela não aceita escrita
-- do papel anon; quem grava é o servidor, depois de validar.

drop policy if exists "leads_public_insert" on public.leads;
revoke insert on public.leads from anon;

-- Remove o registro criado durante o teste de segurança que expôs a falha.
delete from public.leads where name = 'teste-seguranca';
