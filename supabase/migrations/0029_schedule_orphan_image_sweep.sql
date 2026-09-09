-- Agenda a varredura de imagens órfãs (edge function cleanup-orphan-images).
--
-- PASSO MANUAL OBRIGATÓRIO ANTES DE APLICAR
--
-- A service_role key NÃO entra neste arquivo: migration é versionada em git, e
-- essa chave ignora todas as policies de RLS do projeto. Ela fica no Vault, e o
-- agendamento lê de lá na hora de disparar. Rode uma vez, no SQL Editor do
-- painel (nunca commitado):
--
--   select vault.create_secret('<service_role_key>', 'service_role_key');
--
-- Sem o segredo, o job dispara com header vazio, a função responde 401 e nada é
-- apagado — falha fechada, que é o lado certo para errar.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Diário, 04:30 UTC (01:30 em Brasília): fora do horário em que corretor mexe no
-- painel. Não que a carência de 24h dependa disso — mas varredura que apaga
-- arquivo é melhor rodar quando ninguém está cadastrando.
select cron.unschedule('cleanup-orphan-property-images')
where exists (select 1 from cron.job where jobname = 'cleanup-orphan-property-images');

select cron.schedule(
  'cleanup-orphan-property-images',
  '30 4 * * *',
  $$
  select extensions.net.http_post(
    url := 'https://eixzfjmmcocuxnprqskf.supabase.co/functions/v1/cleanup-orphan-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
