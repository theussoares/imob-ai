-- Leads dos portais (ZAP, Viva Real, OLX) entrando sozinhos no funil.
--
-- O sintoma: o feed (0058) sobe os imóveis para o Canal Pro, mas o lead que
-- o anúncio gera volta por e-mail para a caixa de alguém — e é digitado à
-- mão no painel, quando é. É o lead mais caro que a imobiliária tem (ela paga
-- o plano do portal) e o que mais esfria esperando.
--
-- O Canal Pro manda cada lead por POST para uma URL que a imobiliária cola em
-- "Receber leads no CRM", SEM assinatura nem cabeçalho de autenticação
-- (developers.grupozap.com/webhooks/integration_leads.html). Então o segredo é
-- a própria URL: um token por imobiliária, como o do feed.
--
-- Idempotente: seguro rodar de novo.

-- Na mesma tabela do token do feed, pelo mesmo motivo da 0058: `tenants` é
-- lida pelo anon com grant por coluna, e um descuido publicaria o token. Aqui
-- não há policy nem grant — só a service role lê.
alter table public.portal_feeds add column if not exists leads_token text;
alter table public.portal_feeds add column if not exists leads_auto_whatsapp boolean not null default false;
-- `token` (do feed) continua obrigatório: quem cria a linha pelos leads gera
-- os dois de uma vez (`getOrCreateLeadsToken`), e o feed segue lendo sempre
-- um token.

do $$ begin
  alter table public.portal_feeds add constraint portal_feeds_leads_token_key unique (leads_token);
exception when duplicate_object or duplicate_table then null; end $$;

do $$ begin
  alter table public.portal_feeds
    add constraint portal_feeds_leads_token_tamanho check (leads_token is null or length(leads_token) >= 32);
exception when duplicate_object then null; end $$;

-- Recibo de cada lead recebido. O Canal Pro reenvia (até 3 vezes, e guarda
-- por 14 dias para reprocessar), e o mesmo lead pode chegar por mais de um
-- canal: sem isto, cada reenvio seria um card novo e um aviso novo ao
-- corretor. Só ids — nenhum dado da pessoa mora aqui.
create table if not exists public.portal_lead_receipts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  origin_lead_id text not null check (length(origin_lead_id) between 1 and 200),
  -- CASCADE: o recibo some com o lead (expurgo LGPD, exclusão manual). Um
  -- reenvio de 14 dias depois de o lead ter sido apagado a pedido do titular
  -- criaria o lead de novo — mas esse é o próprio portal reprocessando, e a
  -- exclusão definitiva é pedida a ele também.
  lead_id uuid references public.leads(id) on delete cascade,
  received_at timestamptz not null default now(),
  -- O primeiro WhatsApp automático saiu para este lead. Conta para o teto
  -- diário: com a URL vazada, sem teto, cada POST seria uma mensagem paga
  -- saindo do número da imobiliária para um telefone qualquer.
  whatsapp_enviado boolean not null default false,
  primary key (tenant_id, origin_lead_id)
);

alter table public.portal_lead_receipts add column if not exists whatsapp_enviado boolean not null default false;

-- Os tetos contam "recebidos deste tenant na última hora / dia".
create index if not exists portal_lead_receipts_tenant_received_idx
  on public.portal_lead_receipts (tenant_id, received_at desc);

alter table public.portal_lead_receipts enable row level security;
revoke all on public.portal_lead_receipts from anon, authenticated;

comment on table public.portal_lead_receipts is
  'Leads já recebidos do Canal Pro, para o reenvio não duplicar. Só service role. Ver 0063.';
