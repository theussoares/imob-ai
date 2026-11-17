-- Locações do painel de gestão (/gestao): o agregado `Locacao` do domínio
-- (layers/gestao/domain) persistido, para trocar o mock pelo backend real.
--
-- Mesma forma de `gestao_vendas` (0060): colunas só para o que filtra e escopa
-- (tenant, corretor, status, arquivado, etapa) e o resto em `dados jsonb`,
-- validado por Zod na leitura e na escrita (server/mappers/gestao-locacao.ts).
-- Normalizar cobranças e repasses em tabelas próprias foi descartado por ora:
-- reescreveria o domínio que a Olmi já aprovou e multiplicaria migrations; dá
-- para normalizar só as cobranças depois sem mudar a API.
--
-- `versao` é a concorrência otimista: toda gravação é `update … where versao = $v`
-- e quem perde a corrida recebe 409. Sem ela, duas abas abertas na mesma
-- locação se sobrescrevem em silêncio — e aqui há dinheiro (pagamento e repasse
-- registrados) no mesmo jsonb.
--
-- `dados` guarda valores de aluguel, taxa e repasse, que só o perfil com a
-- permissão `valores` pode ver. O recorte acontece no mapper, não no banco: por
-- isso nenhum papel além da service role chega a esta tabela. A RLS fica ligada
-- SEM policy, e o revoke existe porque a RLS sem policy só barra linha depois do
-- GRANT default que o Supabase dá a anon/authenticated.
--
-- `imovel_id` é nulo-permitido: o imóvel pode sair do catálogo, e a locação, que
-- é histórico contratual, não pode sumir junto (por isso `on delete set null`).
-- O nome do imóvel fica em `dados.imovel` como foi escrito na abertura.
--
-- Chave `(tenant_id, id)`: o id é `L-AAAA-NNNN` do domínio, numerado por
-- imobiliária. Duas aberturas simultâneas que calculem o mesmo número colidem
-- aqui (23505) e o servidor devolve 409, em vez de gravar duas locações com o
-- mesmo código.
--
-- NÃO aplicar sem conferir o banco: ver supabase/migrations/README.md.

create table if not exists public.gestao_locacoes (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (id ~ '^L-[0-9]{4}-[0-9]{4,}$'),
  corretor_id uuid references public.brokers(id) on delete set null,
  imovel_id uuid references public.properties(id) on delete set null,
  status text not null,
  arquivado boolean not null default false,
  etapa integer not null default 1 check (etapa between 1 and 8),
  versao integer not null default 1 check (versao >= 1),
  dados jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create index if not exists gestao_locacoes_tenant_atualizado_idx
  on public.gestao_locacoes (tenant_id, updated_at desc);

create index if not exists gestao_locacoes_tenant_corretor_idx
  on public.gestao_locacoes (tenant_id, corretor_id);

alter table public.gestao_locacoes enable row level security;

revoke all on public.gestao_locacoes from anon, authenticated;

comment on table public.gestao_locacoes is
  'Locações do painel de gestão. Só service role; valores em dados são recortados no mapper. Ver 0062.';
