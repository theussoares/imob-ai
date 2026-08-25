-- Fingerprint de IP para anti-flood dos formulários públicos.
-- Guarda hash (não IP em texto puro) para reduzir exposição de dado pessoal.
alter table public.leads
  add column if not exists ip_hash text;

-- Índice para a checagem de janela por tenant + IP hash + created_at.
create index if not exists leads_tenant_ip_hash_created_at_idx
  on public.leads (tenant_id, ip_hash, created_at desc)
  where ip_hash is not null;
