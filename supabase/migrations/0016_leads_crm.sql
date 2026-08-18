-- CRM leve: transforma "leads" (contatos) num funil acionável.
--
-- Baseado no que corretores reclamam dos CRMs de mercado: lead esquecido por
-- falta de etapa clara, follow-up sem lembrete, histórico perdido e o "funil
-- invisível" (o contato chega pelo WhatsApp e nunca vira dado). Cada coluna
-- abaixo ataca um desses pontos, sem inchar o cadastro.

alter table public.leads
  add column if not exists stage text not null default 'novo',
  add column if not exists notes text,
  add column if not exists next_contact_at timestamptz,
  add column if not exists broker_id uuid references public.brokers(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Etapas do funil (as 5 primeiras aparecem no quadro; 'perdido' é arquivo).
alter table public.leads
  drop constraint if exists leads_stage_check;
alter table public.leads
  add constraint leads_stage_check
  check (stage in ('novo', 'contato', 'visita', 'proposta', 'fechado', 'perdido'));

create index if not exists idx_leads_tenant_stage on public.leads(tenant_id, stage);

-- updated_at automático (mesma função usada em tenants/properties).
drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

-- RLS: membros do tenant podem criar (contato manual), mover no funil e excluir.
-- (A leitura já existe em leads_member_read; a escrita pública continua fechada.)
drop policy if exists "leads_member_insert" on public.leads;
create policy "leads_member_insert" on public.leads
  for insert with check (public.is_tenant_member(tenant_id));

drop policy if exists "leads_member_update" on public.leads;
create policy "leads_member_update" on public.leads
  for update using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

drop policy if exists "leads_member_delete" on public.leads;
create policy "leads_member_delete" on public.leads
  for delete using (public.is_tenant_member(tenant_id));
