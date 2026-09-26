-- Rollback da 0049: apaga histórico, agenda e roleta.
--
-- ⚠️ Perde dado: a linha do tempo e as tarefas de todos os leads somem.
-- `next_contact_at` fica com o último valor que o trigger calculou, e volta a
-- ser campo livre. Rode só com o código anterior à 0049 já em produção — o
-- painel novo lê `lead_events` e `lead_tasks`.

drop trigger if exists trg_lead_tasks_sincroniza_lead on public.lead_tasks;
drop trigger if exists trg_lead_events_toca_lead on public.lead_events;
drop function if exists public.lead_tasks_sincroniza_lead();
drop function if exists public.lead_events_toca_lead();
drop function if exists public.proximo_corretor_da_roleta(uuid);

drop table if exists public.lead_tasks;
drop table if exists public.lead_events;

alter table public.tenants drop constraint if exists tenants_lead_distribution_check;
alter table public.tenants drop column if exists lead_distribution;
alter table public.brokers drop column if exists receives_leads;
alter table public.brokers drop column if exists last_lead_at;
alter table public.leads drop constraint if exists leads_lost_reason_check;
alter table public.leads drop column if exists lost_reason;

drop index if exists public.leads_id_tenant_idx;
drop index if exists public.brokers_id_tenant_idx;
drop index if exists public.properties_id_tenant_idx;
