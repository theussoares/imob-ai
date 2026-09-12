-- Recurso pago por tenant — o entitlement da Área do Cliente.
--
-- Primeira feature vendida à parte: a Área do Cliente entra como plano superior
-- na mensalidade, não como melhoria incluída. O mesmo mecanismo serve a dois
-- propósitos: liga para quem paga, e permite subir o portal em produção ligado
-- só para uma imobiliária enquanto as outras não veem nada.
--
-- Append-only de propósito: isto poderia ter sido dobrado dentro da 0028, que
-- ainda não foi aplicada em lugar nenhum. Migration já mergeada não se reescreve,
-- mesmo quando dá — a disciplina vale mais que a arrumação.

-- ---------------------------------------------------------------------------
-- Por que recurso por tenant, e não uma coluna `plan` com enum
--
-- Os nomes dos planos ainda não existem: nada foi vendido. Enum com um valor só
-- é cerimônia, e errar o nome do tier custa migration. Quando houver um segundo
-- recurso pago, `plan` entra como atalho que resolve para um conjunto de
-- recursos — sem desfazer nada disto.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature text not null,
  -- Contratado e em dia.
  enabled boolean not null default false,
  -- Até quando o acesso do CLIENTE continua de pé mesmo com enabled = false.
  -- É o mecanismo da suspensão por inadimplência: a régua adotada é aviso no
  -- vencimento, segundo aviso em D+7, portal suspenso em D+15. Ver a política
  -- completa em docs/superpowers/plans/2026-09-10-area-do-cliente.md.
  grace_until date,
  enabled_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature)
);

-- Nome de recurso é constante de código, não texto livre. Sem esta constraint,
-- um 'protal' digitado errado não dá erro nenhum: simplesmente não casa, e o
-- portal fica desligado em silêncio para um cliente que pagou.
alter table public.tenant_features
  drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal'));

drop trigger if exists trg_tenant_features_updated on public.tenant_features;
create trigger trg_tenant_features_updated before update on public.tenant_features
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- A checagem entra DENTRO de is_portal_user()
--
-- Esta função já gatilha todas as policies do portal. Colocando o entitlement
-- aqui, recurso desligado passa a fechar o acesso NO BANCO, em todo caminho, sem
-- uma linha de código novo em cada endpoint — e sem chance de alguém esquecer de
-- checar num endpoint futuro.
--
-- Ausência de linha em tenant_features significa DESLIGADO. É o default seguro,
-- e é o que permite subir o portal em produção sem ligar para ninguém.
-- ---------------------------------------------------------------------------
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
        -- coalesce em vez de comparar NULL: sem ele, tenant com grace_until
        -- nulo e enabled false produz NULL em vez de false. Dá no mesmo num
        -- `where`, mas lógica de três valores em predicado de segurança é
        -- pegadinha esperando acontecer.
        and (f.enabled or coalesce(f.grace_until, '-infinity'::date) >= current_date)
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- ⚠️ A imobiliária LÊ, mas NÃO ESCREVE. Não existe policy de escrita, e a
-- ausência é intencional: se o membro do tenant pudesse dar update aqui, ele
-- ligaria o próprio recurso pago. Quem vende decide o que está ligado — a
-- escrita acontece por service role.
--
-- O cliente do portal não precisa de policy nenhuma: is_portal_user() é
-- `security definer` e lê esta tabela com o privilégio do dono da função.
-- ---------------------------------------------------------------------------
alter table public.tenant_features enable row level security;

drop policy if exists "tenant_features_member_read" on public.tenant_features;
create policy "tenant_features_member_read" on public.tenant_features
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

revoke all on public.tenant_features from anon;

-- ---------------------------------------------------------------------------
-- Nenhuma linha é semeada aqui.
--
-- Ligar o recurso é ato comercial, com data — e a data importa, porque é dela
-- que sai a régua de suspensão. Fica como operação manual, na mão de quem
-- vendeu:
--
--   insert into public.tenant_features (tenant_id, feature, enabled, enabled_at)
--   values ((select id from public.tenants where slug = 'olmi'), 'portal', true, now())
--   on conflict (tenant_id, feature)
--   do update set enabled = true, enabled_at = now(), grace_until = null;
--
-- O slug 'olmi' é o da imobiliária que pediu a feature — é o único que deve ser
-- ligado no demo da semana 2. Os outros tenants continuam sem linha, e portanto
-- sem portal.
--
-- E para suspender por inadimplência (D+15 a partir do vencimento):
--
--   update public.tenant_features
--      set enabled = false, grace_until = current_date + 15
--    where tenant_id = (select id from public.tenants where slug = '<slug>')
--      and feature = 'portal';
--
-- (D+15 conta do dia em que o UPDATE roda, então rode no vencimento, não antes.)
-- ---------------------------------------------------------------------------
