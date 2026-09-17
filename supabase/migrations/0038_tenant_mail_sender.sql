-- De qual endereço sai o e-mail desta imobiliária.
--
-- O `mailer.ts` tinha UM remetente global: o endereço vinha de
-- `config.mailFrom`, igual para todos os tenants. O plano em que a OLMI se
-- encaixa prevê domínio dedicado, e `olmiimoveis.com.br` já estava verificado
-- na conta Resend — a verificação estava lá sem ninguém usar, porque o e-mail
-- dela continuava saindo como `OLMI IMÓVEIS <nao-responda@usemoradi.com.br>`.
--
-- ⚠️ POR QUE UMA TABELA, E NÃO UMA COLUNA. As duas alternativas naturais
-- entregam o endereço de envio à própria imobiliária:
--
--   - coluna em `tenants`: a tabela tem `tenants_member_update` e NUNCA recebeu
--     `revoke update` de coluna. A coluna nasceria gravável pelo membro, e o
--     whitelist de `toTenantUpdateRow` protege o caminho do app, não o banco;
--   - derivar de `tenant_domains.is_primary`: `tenant_domains_member_write` é
--     `for all` para qualquer membro. O que hoje impede pegar o domínio alheio
--     é o `domain text unique` — constraint de roteamento fazendo autorização
--     por acidente.
--
-- E isso importa porque os domínios de TODOS os clientes vivem na mesma conta
-- Resend: quem controla o endereço de envio manda e-mail como o outro cliente,
-- com SPF e DKIM passando. Autentica.
--
-- Por isso: leitura para o membro, escrita para ninguém. Quem vende grava, por
-- service role — mesma postura da `tenant_features`.
--
-- Ausência de linha = domínio da plataforma. Tenant novo não ganha remetente
-- próprio por esquecimento.
--
-- Idempotente: seguro rodar de novo.

create table if not exists public.tenant_mail_sender (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  from_address text not null,
  -- Para quem vende anotar o contexto (qual plano, quando foi verificado na
  -- Resend). Não é lido pela aplicação.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_mail_sender is
  'Endereço do From por imobiliária. Escrita SÓ pela service role — a imobiliária não escolhe de qual domínio o e-mail dela sai. Ver server/utils/mail-sender.ts.';
comment on column public.tenant_mail_sender.from_address is
  'Endereço completo, ex.: nao-responda@olmiimoveis.com.br. O domínio precisa estar verificado na conta do provedor, senão o envio falha com 502 e mail.falhou no log.';

alter table public.tenant_mail_sender enable row level security;

-- O painel pode querer exibir de onde o e-mail dele sai. Só isso.
drop policy if exists "tenant_mail_sender_member_read" on public.tenant_mail_sender;
create policy "tenant_mail_sender_member_read" on public.tenant_mail_sender
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- ⚠️ O revoke NÃO é redundante com a ausência de policy. A 0036 registrou o
-- motivo: sem ele a proteção é implícita, e no dia em que alguém acrescentar
-- uma policy permissiva a escrita passa a ser permitida sem decisão. Não há
-- erro e não há sintoma.
revoke insert, update, delete, truncate on public.tenant_mail_sender from authenticated;
revoke all on public.tenant_mail_sender from anon;

drop trigger if exists trg_tenant_mail_sender_updated on public.tenant_mail_sender;
create trigger trg_tenant_mail_sender_updated before update on public.tenant_mail_sender
  for each row execute function public.set_updated_at();
