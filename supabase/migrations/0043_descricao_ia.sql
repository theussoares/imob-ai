-- Descrição de imóvel gerada por IA: entitlement, tom por imobiliária e o
-- contador de consumo.
--
-- Por que as três coisas num arquivo só: o recurso não existe sem o contador
-- (a cota é o que impede a conta do provedor de virar variável desconhecida),
-- e o tom não existe sem a constraint que o fecha. Aplicar uma sem a outra
-- deixa um estado que nenhum código sabe ler.
--
-- Idempotente: seguro rodar de novo.

-- 1. A lista de recursos aceitos passa a ter três valores.
--
-- ⚠️ Escrita por extenso de propósito. A constraint hoje é `in ('portal',
-- 'about')`; recriá-la só com o valor novo DESLIGA Área do Cliente e Quem
-- Somos de toda imobiliária que paga, em silêncio, e o primeiro sinal é uma
-- ligação. Nome de recurso é constante de código: a constraint existe para que
-- um valor errado dê erro em vez de sumir com o recurso.
alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai'));

-- 2. Tom da descrição, escolha da imobiliária no painel.
--
-- Lista fechada e não texto livre: campo aberto aqui é instrução do cliente
-- indo direto ao prompt. `check` no banco porque `'caloroso '` com espaço
-- viraria tom ignorado em silêncio — o mesmo motivo de
-- `tenant_features_feature_check` existir.
alter table public.tenants
  add column if not exists ai_tone text not null default 'sobrio';

alter table public.tenants drop constraint if exists tenants_ai_tone_check;
alter table public.tenants
  add constraint tenants_ai_tone_check check (ai_tone in ('sobrio', 'caloroso', 'alto_padrao'));

comment on column public.tenants.ai_tone is
  'Tom da descrição gerada por IA. Rótulos em shared/models/ai-tone.ts — ver 0043.';

-- 3. Consumo, uma linha por TENTATIVA.
--
-- ⚠️ Tentativa, não sucesso, e a distinção é o freio inteiro. Se a linha só
-- nascesse no sucesso, um loop de chamadas que falham seria invisível para os
-- dois contadores — inclusive para o limite por minuto, que existe exatamente
-- para esse caso. Daí `status` e os tokens com default 0: a linha nasce
-- `reservada` antes da chamada e é completada depois.
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- SET NULL e não CASCADE: apagar o imóvel não pode apagar o registro de
  -- consumo, que é base de cobrança e não metadado do imóvel.
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('descricao')),
  model text not null,
  status text not null default 'reservada'
    check (status in ('reservada', 'concluida', 'falhou')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- A consulta da cota é "linhas deste tenant desde o início do mês".
create index if not exists ai_generations_tenant_created_idx
  on public.ai_generations (tenant_id, created_at desc);

-- Dado interno: só a service role toca. RLS ligada com ZERO policies fecha
-- para `authenticated`; o revoke fecha para `anon`, porque o Supabase dá GRANT
-- default e policy sozinha não basta — é o que 0011 e 0028 já fazem.
alter table public.ai_generations enable row level security;
revoke all on public.ai_generations from anon, authenticated;

-- 4. A reserva.
--
-- Por que função no banco e não duas queries no endpoint: contar e depois
-- inserir NÃO serializa nada. Na Vercel cada requisição cai numa lambda
-- diferente; N chamadas concorrentes leem o mesmo contador e passam todas.
-- Um script com 300 requisições paralelas contra uma cota de 100 geraria 300
-- chamadas pagas. O advisory lock é o que fecha essa janela, e
-- `insert ... where (select count(*)) < cota` NÃO fecha sob READ COMMITTED.
create or replace function public.reservar_geracao_ia(
  p_tenant_id uuid,
  p_created_by uuid,
  p_property_id uuid,
  p_kind text,
  p_model text,
  p_cota_mes int,
  p_cota_minuto int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_inicio_mes timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

  -- Fuso da plataforma, não UTC: em UTC a cota vira às 21h do último dia do
  -- mês no horário de Campo Grande, e ninguém consegue explicar isso ao cliente.
  v_inicio_mes := date_trunc('month', now() at time zone 'America/Sao_Paulo')
                    at time zone 'America/Sao_Paulo';

  if (select count(*) from public.ai_generations
       where tenant_id = p_tenant_id and created_at >= v_inicio_mes) >= p_cota_mes then
    return null;
  end if;

  if (select count(*) from public.ai_generations
       where tenant_id = p_tenant_id
         and created_by = p_created_by
         and created_at >= now() - interval '1 minute') >= p_cota_minuto then
    return null;
  end if;

  insert into public.ai_generations (tenant_id, property_id, created_by, kind, model)
  values (p_tenant_id, p_property_id, p_created_by, p_kind, p_model)
  returning id into v_id;

  return v_id;
end $$;

-- ⚠️ Obrigatório, não simetria. A função é SECURITY DEFINER: roda com os
-- privilégios do dono e ignora a RLS que o revoke acima acabou de estabelecer.
-- Com o `grant execute` default do Postgres, quem tem a anon key ganharia de
-- volta exatamente o caminho que INSERE linha de cota.
revoke execute on function public.reservar_geracao_ia(uuid, uuid, uuid, text, text, int, int)
  from anon, authenticated;
