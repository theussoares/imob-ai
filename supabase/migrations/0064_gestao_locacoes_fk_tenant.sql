-- FK composta por tenant em `gestao_locacoes`, como a `gestao_vendas` já tem.
--
-- Lacuna: `corretor_id` e `imovel_id` apontavam só para o `id` de `brokers` e `properties`.
-- Nada no banco impedia uma linha de locação do tenant A ligada ao corretor ou ao imóvel do
-- tenant B; quem barrava era só o servidor (`abrir` e `validarVinculos`). Não era explorável
-- hoje, mas a invariante 1 do projeto diz que o banco não pode depender de a próxima função
-- lembrar de conferir. Com a FK composta, o vínculo cruzado é recusado pelo próprio Postgres.
--
-- `on delete set null (coluna)`: só zera o vínculo, nunca o `tenant_id` (NOT NULL). A lista de
-- colunas no `set null` exige Postgres 15+ (o Supabase roda 17).
--
-- `unique (id, tenant_id)` em `properties` é redundante com a PK, mas é o que a FK composta
-- exige como alvo. O índice já existe desde a 0049, então a linha abaixo é só para esta migration
-- não depender da ordem em que o banco foi montado (`if not exists`: não constrói nada de novo).
--
-- ⚠️ Antes de aplicar em banco com dado, confira se há locação ligada a corretor/imóvel de
-- OUTRO tenant (a FK nova falharia ao validar):
--   select l.tenant_id, l.id from public.gestao_locacoes l
--   left join public.brokers b on b.id = l.corretor_id and b.tenant_id = l.tenant_id
--   where l.corretor_id is not null and b.id is null;
--   (e o mesmo para properties/imovel_id)
--
-- Idempotente: seguro rodar de novo. Rollback: rollback/0064_rollback.sql.

create unique index if not exists brokers_id_tenant_idx on public.brokers (id, tenant_id);
create unique index if not exists properties_id_tenant_idx on public.properties (id, tenant_id);

alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_corretor_id_fkey;
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_corretor_tenant_fk;
alter table public.gestao_locacoes
  add constraint gestao_locacoes_corretor_tenant_fk
  foreign key (corretor_id, tenant_id) references public.brokers (id, tenant_id) on delete set null (corretor_id);

alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_imovel_id_fkey;
alter table public.gestao_locacoes drop constraint if exists gestao_locacoes_imovel_tenant_fk;
alter table public.gestao_locacoes
  add constraint gestao_locacoes_imovel_tenant_fk
  foreign key (imovel_id, tenant_id) references public.properties (id, tenant_id) on delete set null (imovel_id);
