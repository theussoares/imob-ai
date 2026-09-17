-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-12, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260912184412, name=tenant_features
--
-- ⚠️ O cabeçalho original manda "ver supabase/migrations/0032_tenant_features.sql
-- no repositório" — arquivo que NUNCA existiu aqui. É a prova de que a
-- divergência foi falha de processo, não decisão.
--
-- ⚠️ E o comentário abaixo, de que a checagem "entra dentro de is_portal_user(),
-- que já gatilha todas as policies do portal", ESTAVA ERRADO quando foi escrito:
-- naquele momento nenhuma policy chamava a função. Foi a migration seguinte
-- (corrigir_recursao_policies_portal) que passou a chamá-la de verdade.
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

-- Recurso pago por tenant — o entitlement da Área do Cliente.
-- Ver supabase/migrations/0032_tenant_features.sql no repositório.
--
-- Recurso por tenant e não coluna `plan` com enum: os nomes dos planos ainda não
-- existem porque nada foi vendido, e errar o nome do tier custa migration.

create table if not exists public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature text not null,
  enabled boolean not null default false,
  -- Até quando o acesso do CLIENTE continua de pé mesmo com enabled = false.
  -- Mecanismo da suspensão por inadimplência: aviso no vencimento, segundo
  -- aviso em D+7, portal suspenso em D+15.
  grace_until date,
  enabled_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature)
);

-- Nome de recurso é constante de código, não texto livre. Sem esta constraint,
-- um 'protal' digitado errado não dá erro: simplesmente não casa, e o portal
-- fica desligado em silêncio para um cliente que pagou.
alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal'));

drop trigger if exists trg_tenant_features_updated on public.tenant_features;
create trigger trg_tenant_features_updated before update on public.tenant_features
  for each row execute function public.set_updated_at();

-- A checagem entra DENTRO de is_portal_user(), que já gatilha todas as policies
-- do portal. Recurso desligado passa a fechar o acesso NO BANCO, em todo
-- caminho, sem código novo por endpoint.
--
-- Ausência de linha significa DESLIGADO. É o default seguro, e é o que permite
-- subir o portal em produção sem ligar para ninguém.
create or replace function public.is_portal_user(t_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1 from public.portal_users pu
      where pu.tenant_id = t_id
        and pu.user_id = (select auth.uid())
        and pu.active
    )
    and exists (
      select 1 from public.tenant_features f
      where f.tenant_id = t_id
        and f.feature = 'portal'
        -- coalesce em vez de comparar NULL: lógica de três valores em predicado
        -- de segurança é pegadinha esperando acontecer.
        and (f.enabled or coalesce(f.grace_until, '-infinity'::date) >= current_date)
    );
$$;

-- ⚠️ A imobiliária LÊ, mas NÃO ESCREVE. Não existe policy de escrita, e a
-- ausência é intencional: se o membro do tenant pudesse dar update aqui, ele
-- ligaria o próprio recurso pago. Quem vende decide o que está ligado.
alter table public.tenant_features enable row level security;

drop policy if exists "tenant_features_member_read" on public.tenant_features;
create policy "tenant_features_member_read" on public.tenant_features
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.tenant_features from anon;
