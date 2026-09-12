-- ROLLBACK da 0032_tenant_features.sql
--
-- NÃO é migration. Só faz sentido depois que a 0032 tiver sido aplicada — na
-- data em que foi escrita, nem ela nem a 0028 estavam em produção.
--
-- ⚠️ O que este rollback faz é DESLIGAR o entitlement como mecanismo, o que
-- LIBERA o portal para todo tenant que tenha cliente cadastrado. Se algum
-- cliente já estiver usando a Área do Cliente, isto é o oposto de seguro.
--
-- Antes de rodar, pergunte-se o que quebrou. Se o problema é "um cliente que
-- pagou não consegue entrar", a correção é dar `enabled = true` na linha dele —
-- não remover a checagem.

-- Devolve `is_portal_user` à forma da 0028: cliente ativo, sem termo de
-- entitlement.
create or replace function public.is_portal_user(t_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.portal_users pu
    where pu.tenant_id = t_id
      and pu.user_id = (select auth.uid())
      and pu.active
  );
$$;

-- A tabela NÃO é derrubada de propósito: ela guarda desde quando cada
-- imobiliária tem o plano, que é informação comercial. Se o objetivo for mesmo
-- remover, é um `drop table public.tenant_features` explícito, decidido à parte.
