-- CRM: histórico do lead, agenda de tarefas e roleta de corretores.
--
-- O sintoma: todo o atendimento de um lead cabia em `leads.notes`, um texto
-- livre que o corretor sobrescrevia, e em `next_contact_at`, UMA data. Não se
-- sabia quando alguém ligou, quantas vezes, quem mudou a etapa, nem qual visita
-- estava marcada com qual corretor. E o lead que chegava pelo site ficava sem
-- dono até alguém abrir o painel.
-- Ver docs/superpowers/specs/2026-09-25-crm-e-cobranca-design.md, seção 3.
--
-- Três peças:
--   1. `lead_events` — linha do tempo, APPEND-ONLY (sem update/delete para o
--      painel): o histórico vale como prova de atendimento ("liguei três
--      vezes"), e histórico editável não prova nada;
--   2. `lead_tasks` — visitas e retornos com data, dono e imóvel;
--      `leads.next_contact_at` passa a ser DERIVADO delas, por trigger;
--   3. roleta — `brokers.receives_leads`/`last_lead_at` e a função
--      `proximo_corretor_da_roleta`, chamada só pelo servidor.
--
-- ⚠️ LGPD: o expurgo de 24 meses (`purgeStaleLeads`) usa `leads.updated_at`
-- como "último movimento" e poupa lead com retorno futuro. Os dois triggers
-- abaixo existem para manter essas duas leituras verdadeiras: evento e tarefa
-- renovam `updated_at`, e a tarefa aberta mais próxima vira `next_contact_at`.
-- Sem isso, um lead atendido só por anotação seria apagado como "parado".
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 0. O unique que as FKs compostas exigem (mesmo padrão da 0041).
--
-- Redundante com a PK, de propósito: é o que permite a filha referenciar
-- (id, tenant_id). Sem ele, uma tarefa do tenant A poderia apontar para o
-- lead, o imóvel ou o corretor do tenant B cujo id alguém descobrisse — e o
-- endpoint não precisaria nem ser enganado, bastaria o body.
-- ---------------------------------------------------------------------------
create unique index if not exists leads_id_tenant_idx on public.leads (id, tenant_id);
create unique index if not exists brokers_id_tenant_idx on public.brokers (id, tenant_id);
create unique index if not exists properties_id_tenant_idx on public.properties (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------

-- Motivo de perda. Lista fechada porque vira relatório ("por que perdemos?").
-- Obrigatório ao mover para 'perdido' é regra do ENDPOINT, não CHECK: os
-- leads já arquivados como perdido não têm motivo, e um CHECK aqui falharia
-- na própria migration.
alter table public.leads
  add column if not exists lost_reason text;
alter table public.leads drop constraint if exists leads_lost_reason_check;
alter table public.leads add constraint leads_lost_reason_check check (
  lost_reason is null or lost_reason in (
    'preco', 'fechou_com_outro', 'sem_resposta', 'credito_negado',
    'desistiu', 'imovel_indisponivel', 'outro'
  )
);

-- Quem entra na roleta. Padrão FALSE: ligar a roleta não pode começar a
-- mandar lead para corretor que a imobiliária não escolheu.
alter table public.brokers
  add column if not exists receives_leads boolean not null default false,
  add column if not exists last_lead_at timestamptz;

-- 'manual' é o comportamento de hoje, e continua sendo o padrão.
-- Coluna interna: NÃO entra no grant por coluna do anon (0047) — o site
-- público não tem por que saber como a imobiliária distribui contatos.
alter table public.tenants
  add column if not exists lead_distribution text not null default 'manual';
alter table public.tenants drop constraint if exists tenants_lead_distribution_check;
alter table public.tenants add constraint tenants_lead_distribution_check
  check (lead_distribution in ('manual', 'roleta'));

-- ---------------------------------------------------------------------------
-- 2. lead_events — a linha do tempo
-- ---------------------------------------------------------------------------
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null,
  -- Os cinco primeiros o corretor registra; 'etapa', 'atribuicao' e 'tarefa'
  -- só o servidor grava, no mesmo endpoint que muda o estado — registro que o
  -- navegador pode esquecer de mandar não é histórico.
  kind text not null check (kind in (
    'nota', 'ligacao', 'whatsapp', 'email', 'visita',
    'etapa', 'atribuicao', 'tarefa'
  )),
  body text check (body is null or length(body) <= 4000),
  -- { from, to } em 'etapa'; { broker_id, via } em 'atribuicao'.
  meta jsonb not null default '{}'::jsonb,
  -- Quando ACONTECEU, que não é quando foi registrado: a ligação de ontem
  -- anotada hoje.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid,

  foreign key (lead_id, tenant_id) references public.leads (id, tenant_id) on delete cascade
);

create index if not exists lead_events_lead_idx
  on public.lead_events (tenant_id, lead_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 3. lead_tasks — agenda
-- ---------------------------------------------------------------------------
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Nulo = tarefa avulsa (ex.: "avaliar imóvel na rua X").
  lead_id uuid,
  property_id uuid,
  broker_id uuid,
  kind text not null check (kind in ('visita', 'retorno', 'outro')),
  title text not null check (length(title) between 1 and 200),
  due_at timestamptz not null,
  done_at timestamptz,
  done_by uuid,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),

  foreign key (lead_id, tenant_id) references public.leads (id, tenant_id) on delete cascade,
  -- `set null (coluna)`: sem a lista, o SET NULL da FK composta zeraria também
  -- o tenant_id — que é NOT NULL, então o delete do imóvel falharia.
  foreign key (property_id, tenant_id) references public.properties (id, tenant_id) on delete set null (property_id),
  foreign key (broker_id, tenant_id) references public.brokers (id, tenant_id) on delete set null (broker_id),
  constraint lead_tasks_um_desfecho check (done_at is null or canceled_at is null)
);

-- A agenda é "abertas deste tenant, por data", com filtro opcional de corretor.
create index if not exists lead_tasks_agenda_idx
  on public.lead_tasks (tenant_id, due_at)
  where done_at is null and canceled_at is null;
create index if not exists lead_tasks_lead_idx
  on public.lead_tasks (tenant_id, lead_id);

drop trigger if exists trg_lead_tasks_updated on public.lead_tasks;
create trigger trg_lead_tasks_updated before update on public.lead_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Triggers que mantêm `leads` coerente (ver o ⚠️ LGPD no topo)
--
-- SECURITY INVOKER (o padrão), de propósito: quem insere o evento pelo painel
-- já pode atualizar o lead pela policy `leads_member_update`, e o servidor usa
-- a service_role. Um `security definer` aqui seria privilégio que ninguém
-- precisa.
-- ---------------------------------------------------------------------------
create or replace function public.lead_events_toca_lead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.leads set updated_at = now()
  where id = new.lead_id and tenant_id = new.tenant_id;
  return null;
end;
$$;

drop trigger if exists trg_lead_events_toca_lead on public.lead_events;
create trigger trg_lead_events_toca_lead after insert on public.lead_events
  for each row execute function public.lead_events_toca_lead();

-- `next_contact_at` = tarefa aberta mais próxima. Ele continua existindo
-- porque o expurgo e o lembrete de leads parados já leem dele; trocar a fonte
-- sem trocar os leitores seria regressão silenciosa.
create or replace function public.lead_tasks_sincroniza_lead()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  alvo uuid;
begin
  foreach alvo in array array_remove(array[
    case when tg_op <> 'INSERT' then old.lead_id end,
    case when tg_op <> 'DELETE' then new.lead_id end
  ], null)
  loop
    update public.leads l
    set next_contact_at = (
      select min(t.due_at) from public.lead_tasks t
      where t.lead_id = l.id and t.tenant_id = l.tenant_id
        and t.done_at is null and t.canceled_at is null
    )
    where l.id = alvo;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_lead_tasks_sincroniza_lead on public.lead_tasks;
create trigger trg_lead_tasks_sincroniza_lead
  after insert or update or delete on public.lead_tasks
  for each row execute function public.lead_tasks_sincroniza_lead();

-- Retorno agendado antes desta migration vira tarefa, para não sumir na
-- primeira vez que o trigger acima recalcular `next_contact_at`.
insert into public.lead_tasks (tenant_id, lead_id, kind, title, due_at)
select l.tenant_id, l.id, 'retorno', 'Retorno agendado', l.next_contact_at
from public.leads l
where l.next_contact_at is not null
  and not exists (select 1 from public.lead_tasks t where t.lead_id = l.id);

-- ---------------------------------------------------------------------------
-- 5. Roleta
--
-- Escolha e marcação num ÚNICO update, com `for update skip locked`: dois
-- leads chegando no mesmo instante não caem no mesmo corretor nem pulam
-- ninguém. Feito em duas idas do servidor (ler, depois marcar), os dois
-- leriam o mesmo "quem recebeu há mais tempo".
--
-- Devolve null quando o tenant não usa roleta ou ninguém está nela — o lead
-- fica sem dono, exatamente como hoje.
--
-- Só a service_role executa: é o servidor que decide quando um lead entra na
-- roleta. Pelo /rest/v1/rpc, um membro poderia girar a fila à toa.
-- ---------------------------------------------------------------------------
create or replace function public.proximo_corretor_da_roleta(p_tenant_id uuid)
returns uuid
language sql
set search_path = public
as $$
  update public.brokers b
  set last_lead_at = now()
  where b.id = (
    select c.id from public.brokers c
    join public.tenants t on t.id = c.tenant_id
    where c.tenant_id = p_tenant_id
      and t.lead_distribution = 'roleta'
      and c.active and c.receives_leads
    order by c.last_lead_at nulls first, c.created_at
    limit 1
    for update of c skip locked
  )
  returning b.id;
$$;

revoke execute on function public.proximo_corretor_da_roleta(uuid) from public, anon, authenticated;
grant execute on function public.proximo_corretor_da_roleta(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS e grants
--
-- `revoke all from anon`: o Supabase dá GRANT default ao anon, e a policy
-- sozinha não basta (0005, 0011, 0015).
--
-- `lead_events` não tem policy de update nem de delete, e o grant desses
-- comandos é retirado do `authenticated` também: append-only é garantido pelo
-- banco, não pela boa vontade da tela. O delete do lead apaga os eventos pela
-- FK em cascata, que não passa por RLS nem por grant.
-- ---------------------------------------------------------------------------
alter table public.lead_events enable row level security;
alter table public.lead_tasks  enable row level security;

revoke all on public.lead_events from anon;
revoke all on public.lead_tasks  from anon;
revoke update, delete, truncate on public.lead_events from authenticated;

drop policy if exists "lead_events_membro_le" on public.lead_events;
create policy "lead_events_membro_le" on public.lead_events
  for select to authenticated using (public.is_tenant_member(tenant_id));

drop policy if exists "lead_events_membro_insere" on public.lead_events;
create policy "lead_events_membro_insere" on public.lead_events
  for insert to authenticated with check (public.is_tenant_member(tenant_id));

drop policy if exists "lead_tasks_membro" on public.lead_tasks;
create policy "lead_tasks_membro" on public.lead_tasks
  for all to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

comment on table public.lead_events is
  'Linha do tempo do lead. APPEND-ONLY: correção é outra anotação. Ver 0049.';
comment on column public.leads.next_contact_at is
  'DERIVADO de lead_tasks (tarefa aberta mais próxima), por trigger. Não gravar à mão. Ver 0049.';
