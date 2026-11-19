-- Desfaz 0059_gestao_acesso.
--
-- ⚠️ DESTRUTIVO para todos os tenants de uma vez: apaga convites, membros do painel,
-- códigos do 2º fator, sessões verificadas, matriz/configurações e a AUDITORIA
-- (`gestao_eventos`). Só rode se o /gestao nunca foi usado de verdade, ou depois de
-- exportar `gestao_members`, `gestao_settings` e `gestao_eventos`.
--
-- Ordem: nada das migrations 0060–0063 aponta para estas tabelas por FK, mas o código do
-- painel (requireGestaoMember) deixa de funcionar; desligue o recurso antes
-- (`update tenant_features set enabled = false where feature = 'gestao'`).
--
-- O índice de brokers (`brokers_id_tenant_idx`) pertence à 0049 e fica. As contas criadas no
-- Supabase Auth ao aceitar convites NÃO são apagadas aqui: ficam órfãs de tenant.
drop trigger if exists gestao_eventos_append_only on public.gestao_eventos;
drop table if exists public.gestao_login_falhas;
drop table if exists public.gestao_eventos;
drop table if exists public.gestao_settings;
drop table if exists public.gestao_sessions;
drop table if exists public.gestao_otp;
drop table if exists public.gestao_members;
drop function if exists public.gestao_eventos_append_only();
