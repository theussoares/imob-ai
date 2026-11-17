-- Painel de gestão, fase F2: o agregado «processo de venda».
--
-- Até aqui o /gestao guardava vendas em localStorage (mock validado pela Olmi).
-- A regra do processo (permissão, etapas, comissão, status final) já mora em
-- funções puras de layers/gestao/domain; o servidor roda essas MESMAS funções e
-- grava o resultado aqui. Ver docs/superpowers/specs/2026-11-17-gestao-backend-design.md.
--
-- Uma tabela por agregado, com colunas só para o que filtra/escopa e o resto em
-- `dados jsonb` (o `Processo` inteiro, validado por Zod no mapper). Descartado:
-- normalizar pessoas/adiantamentos/histórico em tabelas — reescreveria um domínio
-- já aprovado e multiplicaria endpoints; dá para normalizar uma parte depois sem
-- mudar a API. As colunas `corretor_id`, `status`, `arquivado`, `etapa` são
-- CÓPIAS de `dados`, regravadas a cada escrita; a leitura confia em `dados`.
--
-- `versao` é a concorrência otimista: a escrita é `update ... where versao = $v`,
-- e quem perde a corrida recebe 409 em vez de sobrescrever a outra aba.
--
-- Acesso só pelo servidor (serviceSupabase, sempre com tenant_id no where):
-- RLS ligada SEM policy e `revoke all` de anon/authenticated, porque o Supabase
-- dá GRANT default a esses papéis e a policy ausente sozinha não é a barreira
-- que o CLAUDE.md pede.
--
-- Idempotente: seguro rodar de novo.

-- A FK composta abaixo exige este unique em brokers (a 0049 já o cria; aqui só
-- garante em banco onde ela ainda não rodou).
create unique index if not exists brokers_id_tenant_idx on public.brokers (id, tenant_id);

create table if not exists public.gestao_vendas (
  -- Formato do domínio (`proximoId`): V-AAAA-NNNN, único por tenant.
  id text not null check (id ~ '^V-[0-9]{4}-[0-9]{4,}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  corretor_id uuid not null,
  status text not null check (status in (
    'Em negociação', 'Proposta realizada', 'Proposta aprovada', 'Aguardando documentação',
    'Documentação completa', 'Em análise de financiamento', 'Financiamento aprovado',
    'Contrato em elaboração', 'Aguardando assinatura', 'Contrato assinado',
    'Aguardando registro', 'Venda concluída', 'Venda cancelada'
  )),
  arquivado boolean not null default false,
  etapa int not null check (etapa between 1 and 8),
  versao int not null default 1 check (versao >= 1),
  dados jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  -- FK composta: o corretor tem de ser do MESMO tenant do processo. Sem isso um
  -- tenant_id de A poderia apontar para um corretor de B.
  foreign key (corretor_id, tenant_id) references public.brokers (id, tenant_id) on delete restrict
);

-- Lista do painel: `order by updated_at desc limit 200` por tenant.
create index if not exists gestao_vendas_tenant_updated_idx
  on public.gestao_vendas (tenant_id, updated_at desc);
-- Corretor sem `verTodos` filtra por corretor_id.
create index if not exists gestao_vendas_tenant_corretor_idx
  on public.gestao_vendas (tenant_id, corretor_id);

alter table public.gestao_vendas enable row level security;
revoke all on public.gestao_vendas from anon, authenticated;
