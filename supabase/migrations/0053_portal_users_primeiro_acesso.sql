-- Quando a pessoa entrou na Área do Cliente pela primeira vez.
--
-- O sintoma: a lista de Clientes dizia "Acessa o portal" para quem o convite
-- nem tinha chegado. O rótulo lia `access_confirmed_at`, que não significa
-- "entrou": a 0037 o preenche também quando a conta NASCE do convite — antes
-- de o e-mail sair, e mesmo que ele falhe. Aquela coluna é guarda de segurança
-- (decide se o reenvio leva token) e não pode mudar de sentido; por isso o
-- "já entrou" ganha a sua própria.
--
-- Gravada por service role na primeira requisição autenticada do portal
-- (`requirePortalUser`), uma vez só: `is null` no filtro.
--
-- ⚠️ Backfill NULO: não há como saber quem já entrou antes desta coluna. Quem
-- entrou aparece como "ainda não entrou" até a próxima visita — erro que some
-- sozinho, e para o lado de não prometer o que não se sabe.
--
-- Sem grant novo: `portal_users` já é lida pelo membro com `select *` e fechada
-- ao anon desde a 0028.

alter table public.portal_users
  add column if not exists first_login_at timestamptz;

comment on column public.portal_users.first_login_at is
  'Primeira entrada na Área do Cliente desta imobiliária. Nulo = nunca entrou (ou entrou antes da 0053).';
