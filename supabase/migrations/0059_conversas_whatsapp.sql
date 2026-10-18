-- Conversas do WhatsApp dentro do painel (Cloud API oficial da Meta).
--
-- O sintoma: o sistema sabia que alguém CLICOU no WhatsApp (0046), mas a
-- conversa acontecia no celular do corretor — quando ele saía, levava os
-- clientes e o histórico, e ninguém sabia quanto tempo o lead esperou.
-- Ver docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md.
--
-- Três tabelas, e nenhuma aceita escrita de `authenticated` nem de `anon`:
-- toda escrita é do servidor, pela service_role, depois de validar. Uma
-- mensagem "enviada" gravada direto pelo navegador, sem passar pela Meta,
-- seria histórico falso ("respondi" sem ter respondido) — e o histórico é o
-- que o dono da imobiliária usa para cobrar o corretor.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Recurso por imobiliária
--
-- ⚠️ Escrita por extenso, pelo mesmo motivo da 0045/0054/0055: recriar a
-- constraint sem um dos valores existentes DESLIGA aquele recurso de toda
-- imobiliária que paga.
-- ---------------------------------------------------------------------------
alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check
  check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca', 'whatsapp'));

-- ---------------------------------------------------------------------------
-- 2. Número conectado
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'cloud_api' check (provider in ('cloud_api')),
  -- UNIQUE GLOBAL, não por tenant: é por ele que o webhook descobre de quem é
  -- a mensagem. Dois tenants com o mesmo número fariam a conversa de um cair
  -- no painel do outro.
  phone_number_id text not null unique,
  waba_id text not null,
  display_phone text,
  verified_name text,
  -- AES-256-GCM (`server/utils/cofre.ts`). O token manda mensagem em nome da
  -- imobiliária; em texto puro, um dump do banco bastaria para isso.
  access_token_enc text,
  status text not null default 'ativo' check (status in ('ativo', 'desconectado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_accounts_tenant_idx on public.whatsapp_accounts (tenant_id);

drop trigger if exists trg_whatsapp_accounts_updated on public.whatsapp_accounts;
create trigger trg_whatsapp_accounts_updated before update on public.whatsapp_accounts
  for each row execute function public.set_updated_at();

alter table public.whatsapp_accounts enable row level security;

-- Sem policy nenhuma, e sem grant: nem o membro lê. O painel recebe os campos
-- seguros pela API; o token cifrado não tem motivo para sair do servidor, e o
-- GRANT default do Supabase entregaria a coluna a quem tivesse policy de
-- leitura.
revoke all on public.whatsapp_accounts from anon;
revoke all on public.whatsapp_accounts from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Conversa: uma por (número conectado, contato)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  -- Número do contato como a Meta manda (E.164 sem +). Pode vir sem o nono
  -- dígito; o casamento com o lead trata as duas formas.
  wa_id text not null,
  contact_name text,
  -- SET NULL nos três: apagar o lead (expurgo LGPD, exclusão manual) não apaga
  -- a conversa de uma vez — ela cai na regra de 90 dias sem lead.
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  whatsapp_click_id uuid references public.whatsapp_clicks(id) on delete set null,
  -- Última mensagem do CONTATO. É ela que abre a janela de 24h da Meta.
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_direction text check (last_direction in ('in', 'out')),
  -- Primeira resposta da imobiliária depois da primeira mensagem — o número
  -- que o dono pede. Pelo painel ou pelo app (eco do Coexistence).
  first_response_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, wa_id)
);

create index if not exists whatsapp_conversations_tenant_recent_idx
  on public.whatsapp_conversations (tenant_id, last_message_at desc);
create index if not exists whatsapp_conversations_lead_idx
  on public.whatsapp_conversations (lead_id) where lead_id is not null;

drop trigger if exists trg_whatsapp_conversations_updated on public.whatsapp_conversations;
create trigger trg_whatsapp_conversations_updated before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

alter table public.whatsapp_conversations enable row level security;
revoke all on public.whatsapp_conversations from anon;
-- Só leitura para o membro: é o que o Realtime precisa (ele avalia a policy
-- de SELECT por linha contra o JWT de quem assinou).
revoke insert, update, delete on public.whatsapp_conversations from authenticated;

drop policy if exists "whatsapp_conversations_member_read" on public.whatsapp_conversations;
create policy "whatsapp_conversations_member_read" on public.whatsapp_conversations
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Não lida somada NO BANCO. Ler, somar e gravar pelo servidor perderia
-- contagem quando duas mensagens do mesmo contato chegam em webhooks
-- paralelos — os dois leriam 3 e gravariam 4.
--
-- Só a service_role executa: é o webhook quem chama. Sem o revoke, o default
-- do Postgres (EXECUTE para PUBLIC) deixaria qualquer um inflar o contador de
-- qualquer conversa pela API REST.
create or replace function public.whatsapp_conversa_nao_lida(p_tenant_id uuid, p_conversation_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.whatsapp_conversations
     set unread_count = unread_count + 1
   where id = p_conversation_id and tenant_id = p_tenant_id;
$$;

revoke execute on function public.whatsapp_conversa_nao_lida(uuid, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_conversa_nao_lida(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Mensagem
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  -- Id da mensagem na Meta. A Meta REENVIA webhook; o unique abaixo é o que
  -- impede a mesma mensagem de virar duas, contar não lida duas vezes e
  -- disparar dois avisos.
  wamid text,
  direction text not null check (direction in ('in', 'out')),
  -- De onde saiu a mensagem de saída: pelo painel, ou pelo app do celular
  -- (eco do Coexistence). Entrada é sempre 'contato'.
  origin text not null check (origin in ('contato', 'painel', 'app')),
  type text not null default 'text',
  body text,
  status text not null default 'recebida'
    check (status in ('recebida', 'enviada', 'entregue', 'lida', 'falhou')),
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_tenant_wamid_uidx
  on public.whatsapp_messages (tenant_id, wamid) where wamid is not null;
create index if not exists whatsapp_messages_conversation_idx
  on public.whatsapp_messages (conversation_id, occurred_at desc);

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon;
revoke insert, update, delete on public.whatsapp_messages from authenticated;

drop policy if exists "whatsapp_messages_member_read" on public.whatsapp_messages;
create policy "whatsapp_messages_member_read" on public.whatsapp_messages
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. LGPD: conversa conta como movimento do lead
--
-- O expurgo de 24 meses (`purgeStaleLeads`) usa `leads.updated_at` como
-- "último movimento". Sem este trigger, um lead que só conversa pelo
-- WhatsApp — sem ninguém mexer na ficha — seria apagado em pleno atendimento.
-- Mesmo desenho de `lead_events_toca_lead` (0049).
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_messages_toca_lead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.leads l set updated_at = now()
  from public.whatsapp_conversations c
  where c.id = new.conversation_id
    and c.tenant_id = new.tenant_id
    and l.id = c.lead_id
    and l.tenant_id = new.tenant_id;
  return null;
end;
$$;

drop trigger if exists trg_whatsapp_messages_toca_lead on public.whatsapp_messages;
create trigger trg_whatsapp_messages_toca_lead after insert on public.whatsapp_messages
  for each row execute function public.whatsapp_messages_toca_lead();

-- ---------------------------------------------------------------------------
-- 6. Realtime (mesmo desenho da 0019)
--
-- Sem `replica identity full`: o painel assina INSERT e UPDATE só para saber
-- QUE mudou e recarregar pela API; a linha antiga no WAL seria conteúdo de
-- conversa replicado sem necessidade.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;
end $$;
