-- Painel de Gestão (/gestao): acesso de verdade — convite, senha, código por
-- e-mail e permissões por imobiliária. Fase F1 de
-- docs/superpowers/specs/2026-11-17-gestao-backend-design.md.
--
-- Até aqui o /gestao era demonstração: contas, convites e o código do 2º fator
-- viviam no localStorage do navegador (layers/gestao/domain/auth.ts avisa isso
-- no topo). Quem tinha o aparelho lia tudo. Esta migration cria onde essas
-- coisas passam a morar no servidor.
--
-- Por que tabelas próprias e não `tenant_members.role`: `tenant_members` abre o
-- /admin (CRM, cobrança). Corretor e recepção do painel de gestão não podem
-- herdar isso só por terem conta.
--
-- ⚠️ Nenhuma policy, de propósito, e `revoke all` de anon E authenticated em
-- toda tabela. O painel é servidor: tudo passa por `serviceSupabase()` com
-- `tenant_id` no where (CLAUDE.md, invariantes 1 e 2). Policy por papel seria
-- superfície a mais — e o Supabase dá GRANT default em tabela nova, então sem o
-- revoke qualquer usuário logado de qualquer imobiliária leria isto pelo
-- /rest/v1. `test/server/gestao-migration-guardrail.test.ts` cobra o par em
-- toda tabela gestao_* desta migration em diante.
--
-- NÃO aplicada por esta sessão: develop e produção dividem o banco. Aplicar é
-- decisão do dono do projeto (supabase/migrations/README.md).
--
-- Idempotente: seguro rodar de novo.

-- O unique que a FK composta do corretor exige. Já existe desde a 0049; repetido
-- para esta migration não depender da ordem em que o banco foi montado.
create unique index if not exists brokers_id_tenant_idx on public.brokers (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 1. Membros do painel
--
-- Nasce no convite (user_id nulo) e ganha o user_id ao aceitar. Um registro por
-- e-mail por tenant: convidar de novo atualiza o convite em vez de criar outro,
-- senão dois links com perfis diferentes valeriam ao mesmo tempo.
--
-- O corretor aponta para `brokers` por FK COMPOSTA com tenant_id: sem isso, quem
-- convida poderia ligar o corretor a um cadastro de outra imobiliária pelo body.
-- Sem `on delete set null`: o check abaixo recusaria o nulo para corretor de
-- qualquer jeito; apagar o cadastro de um corretor com acesso exige tirar o
-- acesso antes, e isso é melhor que perder o acesso calado.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  perfil text not null check (perfil in ('corretor', 'recepcao', 'juridico', 'dono')),
  broker_id uuid,
  invite_token_hash text,
  invite_expires_at timestamptz,
  convidado_por text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gestao_members_corretor_check check (perfil <> 'corretor' or broker_id is not null),
  constraint gestao_members_broker_fk foreign key (broker_id, tenant_id) references public.brokers (id, tenant_id)
);

create unique index if not exists gestao_members_tenant_user_idx on public.gestao_members (tenant_id, user_id);
create unique index if not exists gestao_members_tenant_email_idx on public.gestao_members (tenant_id, lower(email));
-- O link do convite é buscado pelo hash; sem índice cada abertura varreria a tabela.
create index if not exists gestao_members_invite_idx on public.gestao_members (tenant_id, invite_token_hash);

alter table public.gestao_members enable row level security;
revoke all on public.gestao_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Código do 2º fator
--
-- Uma linha por usuário por tenant: o código novo substitui o anterior, senão
-- dois códigos válidos dobrariam os palpites. Só o HMAC do código fica aqui
-- (server/utils/gestao-otp.ts); o código em si existe só no e-mail.
-- `attempts` é o que o servidor usa como condição do update — é o que faz cada
-- tentativa valer uma vez mesmo com requisições em paralelo.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_otp (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  locked_until timestamptz,
  last_sent_at timestamptz not null default now(),
  consumed_at timestamptz,
  primary key (tenant_id, user_id)
);

alter table public.gestao_otp enable row level security;
revoke all on public.gestao_otp from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sessões que cumpriram o 2º fator
--
-- Pela `session_id` do JWT do Supabase: o refresh mantém a mesma sessão (o
-- 2º fator vale até ela acabar) e um login novo nasce com outra (pede outro
-- código). Tenant e usuário na linha impedem que a sessão verificada numa
-- imobiliária valha em outra. A chave é (session_id, tenant_id), e não só a
-- sessão: quem é membro de duas imobiliárias verifica cada uma, e com a sessão
-- sozinha como chave a segunda verificação apagaria a primeira.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_sessions (
  session_id uuid not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now(),
  primary key (session_id, tenant_id)
);

create index if not exists gestao_sessions_tenant_user_idx on public.gestao_sessions (tenant_id, user_id);

alter table public.gestao_sessions enable row level security;
revoke all on public.gestao_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Matriz de permissões e configurações por tenant
--
-- Nulo = padrão do domínio (`matrizPadrao`, `configuracoesPadrao`). Guardar o
-- padrão copiado congelaria a imobiliária no padrão de hoje.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  matriz jsonb,
  config jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gestao_settings enable row level security;
revoke all on public.gestao_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Auditoria append-only
--
-- O `hist` dos agregados (F2/F4) é jsonb editável junto com o processo; a
-- auditoria precisa de algo que só cresce. O trigger recusa update e delete até
-- para a service_role, que é quem o servidor usa.
--
-- `ator_user_id` sem FK para auth.users: apagar a conta de quem agiu não pode
-- apagar (nem travar) o registro do que ela fez. O nome vai junto pelo mesmo
-- motivo.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_eventos (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ator_user_id uuid not null,
  ator_nome text not null,
  acao text not null,
  alvo_tipo text not null check (alvo_tipo in ('venda', 'locacao', 'documento', 'imovel', 'membro', 'config', 'consulta')),
  alvo_id text not null,
  quando timestamptz not null default now()
);

create index if not exists gestao_eventos_tenant_quando_idx on public.gestao_eventos (tenant_id, quando desc);

alter table public.gestao_eventos enable row level security;
revoke all on public.gestao_eventos from anon, authenticated;

-- A exceção: o `on delete cascade` de `tenants`. O e2e apaga o tenant `e2e-*`
-- ao fim de cada execução (e2e/support/tenant.ts); sem a exceção, a limpeza
-- falharia no primeiro evento. Durante a cascata a linha do tenant já não é
-- visível, e tenant apagado não tem auditoria a proteger.
create or replace function public.gestao_eventos_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'gestao_eventos é append-only (%).', tg_op using errcode = 'P0001';
end;
$$;

drop trigger if exists gestao_eventos_append_only on public.gestao_eventos;
create trigger gestao_eventos_append_only
  before update or delete on public.gestao_eventos
  for each row execute function public.gestao_eventos_append_only();

revoke execute on function public.gestao_eventos_append_only() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Falhas de login (limite por conta e por IP)
--
-- Contador no banco pelo mesmo motivo de `rate-limit.ts`: em serverless um
-- contador em memória só pegaria quem caísse na mesma lambda. E o limite do
-- próprio Supabase Auth é por IP de origem — aqui a origem é o servidor, então
-- todo usuário dividiria o mesmo balde.
--
-- `chave` é HMAC (conta ou IP) com o pepper do servidor: a tabela conta
-- tentativas, não guarda quem tentou. Linhas com mais de um dia são apagadas
-- pelo próprio servidor ao gravar.
-- ---------------------------------------------------------------------------
create table if not exists public.gestao_login_falhas (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  chave text not null,
  created_at timestamptz not null default now()
);

create index if not exists gestao_login_falhas_chave_idx on public.gestao_login_falhas (tenant_id, chave, created_at);

alter table public.gestao_login_falhas enable row level security;
revoke all on public.gestao_login_falhas from anon, authenticated;
