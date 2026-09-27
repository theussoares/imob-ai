-- Clique no WhatsApp dispensado sem virar contato.
--
-- O sintoma (teste de 27/09): a lista "Cliques no WhatsApp · N sem contato"
-- só esvaziava com "Virar contato". Clique que ninguém lembra de quem foi, que
-- não deu em conversa, ou cuja pessoa já foi cadastrada à mão ficava pendente
-- para sempre — e o "sem contato" deixava de dizer o que falta fazer.
--
-- Dispensar MARCA, não apaga: o clique continua contando nas métricas de
-- clique do painel. Some com o resto na retenção de 90 dias (cron de leads
-- parados), como antes.
--
-- `dismissed_by` é quem da equipe dispensou (membro, não visitante): nenhum
-- dado novo sobre a pessoa que clicou, então a política de privacidade não
-- muda.
--
-- SEM grant ao `authenticated`: quem grava é o servidor, pela service role,
-- com o tenant da sessão no where. Abrir as colunas ao membro (primeira versão
-- desta migration) deixava qualquer membro, pela anon key e o próprio JWT,
-- gravar `dismissed_by` com o id de um colega ou "desdispensar" um clique — o
-- registro de quem dispensou deixava de valer (achado da revisão de
-- segurança). `revoke update` da 0046 continua valendo para o resto.

alter table public.whatsapp_clicks
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid references auth.users(id) on delete set null;

revoke update (dismissed_at, dismissed_by) on public.whatsapp_clicks from authenticated;

comment on column public.whatsapp_clicks.dismissed_at is
  'Quando alguém da equipe dispensou o clique sem virar contato (0057). Nulo = pendente ou convertido.';
