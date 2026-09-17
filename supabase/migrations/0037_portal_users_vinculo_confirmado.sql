-- Quando esta imobiliária pode emitir um token para esta conta.
--
-- O buraco que esta coluna fecha, encontrado na revisão do PR #26:
--
-- `convidarClientePortal` decide gerar um link de redefinição pelo fato de a
-- linha em `portal_users` existir. Só que a linha é inserida em TODOS os casos,
-- inclusive no caso 3 — e-mail que já tinha conta na plataforma e não era
-- cliente desta imobiliária. Então o caso 3 não era terminal: bastava convidar
-- duas vezes. A primeira chamada criava a linha (aviso sem token, como
-- desenhado); a segunda via a linha, se julgava reenvio e mandava um
-- `recovery` de verdade para a caixa da vítima — com nome de exibição e
-- Reply-To que a própria imobiliária edita. Que é exatamente o reset forçado
-- com remetente autêntico que a nota daquele arquivo diz impedir.
--
-- A guarda tinha que olhar COMO a linha nasceu, não se ela existe.
--
-- `access_confirmed_at` é esse "como". Preenchido em dois momentos, e só:
--   1. a conta nasceu deste convite (o e-mail não existia na plataforma) — não
--      há conta alheia para sequestrar, e o reenvio do convite é legítimo;
--   2. a pessoa ENTROU na Área do Cliente desta imobiliária (gravado em
--      `requirePortalUser`, por service role) — ela provou que a caixa e a
--      senha são dela.
--
-- Nulo significa: a linha nasceu do caso 3 e ninguém confirmou nada. Aviso sem
-- token, sempre, por mais vezes que o painel insista.
--
-- ⚠️ BACKFILL DE PROPÓSITO NULO. As linhas que já existem não têm como dizer de
-- qual caso vieram, e adivinhar erra para o lado perigoso. Nulo erra para o
-- lado seguro: no máximo um cliente antigo recebe o aviso sem link e usa o
-- "esqueci minha senha" do próprio portal, que é público e tem cooldown (0033).
-- O primeiro login dele corrige a linha para sempre.
--
-- Idempotente: seguro rodar de novo.

alter table public.portal_users
  add column if not exists access_confirmed_at timestamptz;

comment on column public.portal_users.access_confirmed_at is
  'Quando esta imobiliaria passou a poder emitir token para esta conta: conta criada por este convite, ou primeiro login do cliente no portal dela. Nulo = conta preexistente de terceiro, nunca gera token. Ver server/repositories/portal-invite.repository.ts.';

-- Sem índice: a coluna só é lida na linha que a consulta por (tenant_id, email)
-- ou (tenant_id, user_id) já encontrou — os dois índices já existem.
