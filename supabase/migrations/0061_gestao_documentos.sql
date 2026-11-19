-- Documentos do painel /gestao (venda e locação) + bucket PRIVADO `gestao-docs`.
--
-- RG, CPF, certidões, matrícula e comprovantes de renda são dado pessoal
-- sensível. Por isso nada aqui se parece com `property-images`: o bucket é
-- privado, não há policy de storage para anon NEM para authenticated, e o
-- arquivo só sai por URL assinada de 60 s emitida pelo servidor depois de checar
-- tenant, visibilidade do processo e lixeira. O upload também é por URL
-- assinada emitida pelo servidor (`createSignedUploadUrl`): o caminho do objeto
-- nunca vem do navegador.
--
-- Alternativa descartada: reusar `portal-docs`. Aquele bucket é do cliente final
-- (policy por pasta de slug e por papel no contrato); misturar faria a policy do
-- portal alcançar documento interno da imobiliária.
--
-- `alvo_id` é o id textual do agregado (`V-2026-0001`), sem FK: `gestao_vendas`
-- (0060) e `gestao_locacoes` (0062) são fases separadas e a chave é composta
-- `(tenant_id, id)`. A existência e a visibilidade do alvo são checadas pelo
-- servidor (`carregarAlvoVisivel`) antes de qualquer escrita.
--
-- `estado = 'pendente'` aqui significa «upload ainda não confirmado», não «item
-- do checklist sem arquivo» (esse é derivado pela ausência de linha). A linha só
-- vira `enviado` depois que o servidor abre o objeto e confere o formato.
--
-- Tamanho máximo 15 MB e quatro formatos (PDF/JPEG/PNG/WEBP), pelo mesmo motivo
-- da 0052: o Storage recusa pelo Content-Type declarado e o servidor confere os
-- primeiros bytes na confirmação.
--
-- Idempotente. NÃO aplicar sem conferir o banco: develop e produção o dividem.

create table if not exists public.gestao_documentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  alvo_tipo     text not null check (alvo_tipo in ('venda', 'locacao')),
  alvo_id       text not null,
  requisito     text,
  nome          text not null,
  categoria     text not null check (categoria in ('pessoas', 'imoveis', 'venda', 'locacao', 'vistoria', 'financeiro')),
  estado        text not null default 'pendente' check (estado in ('pendente', 'enviado', 'conferido')),
  tamanho       bigint not null default 0,
  versao        integer not null default 0 check (versao >= 0),
  mime          text,
  storage_path  text,
  enviado_por   text not null,
  apagado_por   text,
  apagado_em    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gestao_documentos_alvo_idx
  on public.gestao_documentos (tenant_id, alvo_tipo, alvo_id);
create index if not exists gestao_documentos_lixeira_idx
  on public.gestao_documentos (tenant_id, apagado_em) where apagado_em is not null;

alter table public.gestao_documentos enable row level security;
-- Sem policy: acesso só pela service_role, que o servidor usa com tenant_id no where.
-- O revoke é o que fecha de verdade — o Supabase dá GRANT default a anon/authenticated.
revoke all on public.gestao_documentos from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gestao-docs', 'gestao-docs', false,
  15 * 1024 * 1024,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 15 * 1024 * 1024,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Nenhuma policy em storage.objects para este bucket, de propósito.
