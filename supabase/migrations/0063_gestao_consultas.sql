-- Histórico da consulta cadastral (SPC/Serasa) do painel de gestão (/gestao).
--
-- Hoje a consulta é SIMULADA (layers/gestao/domain/consulta.ts): nenhum bureau é
-- chamado e toda linha nasce com `simulada = true`. A tabela já existe para o
-- histórico sobreviver ao dia em que o provedor real entrar; trocar o provedor
-- não muda o formato.
--
-- LGPD: a coluna é `documento_mascarado` e NÃO existe coluna com o documento
-- inteiro, de propósito. A política de privacidade não prevê guardar CPF/CNPJ de
-- terceiro que não virou contrato, e o que não é gravado não vaza. Alternativa
-- descartada: guardar o documento inteiro cifrado — exigiria prazo de retenção,
-- base legal e rotina de descarte que ninguém decidiu ainda. O check abaixo
-- recusa, no banco, um documento sem máscara que algum código futuro tente gravar.
--
-- `restricoes jsonb` guarda o resultado (fonte, credor, valor, desde). É a mesma
-- decisão de `gestao_locacoes`: o resultado só é lido junto com a consulta.
--
-- Só a service role chega aqui: RLS ligada SEM policy, e o revoke existe porque a
-- RLS sem policy só barra linha depois do GRANT default do Supabase a
-- anon/authenticated (um usuário logado em QUALQUER imobiliária leria o histórico
-- de crédito de outra).
--
-- Chave `(tenant_id, id)`: `C-NNNN` numerado por imobiliária. Dois pedidos
-- simultâneos que calculem o mesmo número colidem aqui (23505) e o servidor
-- devolve 409, em vez de gravar duas consultas com o mesmo código.
--
-- NÃO aplicar sem conferir o banco: ver supabase/migrations/README.md.

create table if not exists public.gestao_consultas (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (id ~ '^C-[0-9]{4,}$'),
  documento_mascarado text not null
    check (documento_mascarado ~ '^[0-9]{3}\.\*\*\*\.\*\*\*-[0-9]{2}$'
        or documento_mascarado ~ '^[0-9]{2}\.\*\*\*\.\*\*\*/[0-9]{4}-[0-9]{2}$'),
  tipo text not null check (tipo in ('cpf', 'cnpj')),
  finalidade text not null check (finalidade in ('Locação', 'Venda', 'Outra análise de crédito')),
  contrato_id text,
  ator_user_id uuid not null,
  ator_nome text not null,
  situacao text not null check (situacao in ('sem-restricoes', 'com-restricoes')),
  score integer not null check (score between 0 and 1000),
  restricoes jsonb not null default '[]'::jsonb,
  simulada boolean not null default true,
  quando timestamptz not null default now(),
  primary key (tenant_id, id)
);

create index if not exists gestao_consultas_tenant_quando_idx
  on public.gestao_consultas (tenant_id, quando desc);

alter table public.gestao_consultas enable row level security;

revoke all on public.gestao_consultas from anon, authenticated;

comment on table public.gestao_consultas is
  'Histórico da consulta cadastral do gestão. Documento só mascarado; resultado simulado enquanto não houver provedor. Só service role. Ver 0063.';
