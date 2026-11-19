-- Desfaz 0064: volta às FKs simples de `gestao_locacoes` (corretor_id/imovel_id → id).
-- Os índices únicos (brokers_id_tenant_idx e properties_id_tenant_idx são da 0049) ficam: são inofensivos.
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_corretor_tenant_fk;
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_imovel_tenant_fk;
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_corretor_id_fkey;
alter table public.gestao_locacoes
  add constraint gestao_locacoes_corretor_id_fkey foreign key (corretor_id) references public.brokers (id) on delete set null;
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_imovel_id_fkey;
alter table public.gestao_locacoes
  add constraint gestao_locacoes_imovel_id_fkey foreign key (imovel_id) references public.properties (id) on delete set null;
