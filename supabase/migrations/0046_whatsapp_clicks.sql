-- Clique no botão de WhatsApp do site, registrado para o painel.
--
-- O sintoma: metade dos contatos sai pelo `wa.me`, e o sistema não ficava
-- sabendo de nenhum — o "funil invisível" que a 0016 já citava. O clique não
-- diz QUEM clicou; diz de qual imóvel e para qual número a conversa foi, que é
-- o que permite a quem atende casar a mensagem recebida com o imóvel.
-- Ver docs/superpowers/specs/2026-09-25-clique-whatsapp-design.md.
--
-- Tabela à parte, e não linha em `leads`: um clique sem nome nem telefone não
-- é contato, e no quadro viraria card vazio para alguém arquivar à mão.
--
-- Idempotente: seguro rodar de novo.

create table if not exists public.whatsapp_clicks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- SET NULL: imóvel apagado não apaga o registro de que alguém chamou.
  property_id uuid references public.properties(id) on delete set null,
  -- Preenchido só quando a conversa foi para o corretor captador.
  broker_id uuid references public.brokers(id) on delete set null,
  destination text not null check (destination in ('corretor', 'imobiliaria')),
  -- Lista fechada: o endpoint é público e isto vira métrica mostrada ao cliente.
  origin text not null check (origin in ('imovel', 'card', 'barra_fixa', 'site')),
  -- Pseudônimo do IP (sha256 com sal), para deduplicar toque repetido. Some
  -- em 90 dias com a linha (ver o cron de leads parados).
  ip_hash text,
  -- O lead que alguém criou a partir deste clique no painel.
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- A lista do painel é "cliques deste tenant nos últimos 7 dias".
create index if not exists whatsapp_clicks_tenant_created_idx
  on public.whatsapp_clicks (tenant_id, created_at desc);

-- A deduplicação é "este IP, neste tenant, na última meia hora".
create index if not exists whatsapp_clicks_tenant_ip_idx
  on public.whatsapp_clicks (tenant_id, ip_hash, created_at desc)
  where ip_hash is not null;

alter table public.whatsapp_clicks enable row level security;

-- A anon key vai no HTML de toda página: com o GRANT default do Supabase, o
-- visitante gravaria clique direto no banco e pularia a validação e a
-- deduplicação do endpoint. É o padrão da 0015 — policy sozinha não basta.
revoke all on public.whatsapp_clicks from anon;

drop policy if exists "whatsapp_clicks_member_read" on public.whatsapp_clicks;
create policy "whatsapp_clicks_member_read" on public.whatsapp_clicks
  for select using (public.is_tenant_member(tenant_id));

-- Update só para marcar a conversão. O `with check` amarra o lead ao MESMO
-- tenant: sem ele, um membro poderia apontar o clique para um lead de outra
-- imobiliária cujo id descobrisse.
drop policy if exists "whatsapp_clicks_member_update" on public.whatsapp_clicks;
create policy "whatsapp_clicks_member_update" on public.whatsapp_clicks
  for update
  using (public.is_tenant_member(tenant_id))
  with check (
    public.is_tenant_member(tenant_id)
    and (
      lead_id is null
      or exists (
        select 1 from public.leads l
        where l.id = lead_id and l.tenant_id = whatsapp_clicks.tenant_id
      )
    )
  );

-- A policy acima diz QUAIS linhas; o grant diz QUAIS colunas. Sem isto, o
-- `authenticated` fica com o UPDATE default do Supabase em todas elas, e o
-- membro reescreveria `property_id` pela API REST antes de converter — o
-- "imóvel sai do clique, nunca do body" deixaria de valer no banco — ou
-- `created_at`, escapando da retenção de 90 dias. Revoke ANTES do grant.
revoke update on public.whatsapp_clicks from authenticated;
grant update (lead_id) on public.whatsapp_clicks to authenticated;

-- Sem policy de insert nem de delete: quem grava é o servidor, pela service
-- role, depois de validar; quem apaga é o cron de retenção.
