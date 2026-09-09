-- Agenda a varredura de imagens órfãs (edge function cleanup-orphan-images).
--
-- Não há passo manual: o token que autentica a chamada é gerado aqui e guardado
-- no Vault. Nenhuma credencial entra neste arquivo.
--
-- POR QUE UM TOKEN PRÓPRIO, E NÃO A SERVICE_ROLE KEY
--
-- O caminho óbvio seria o cron mandar a service_role key no `Authorization` e a
-- função comparar com o `SUPABASE_SERVICE_ROLE_KEY` do ambiente dela. Não
-- funciona neste projeto, e a tentativa custou um 401: as API keys foram
-- migradas para o formato novo, então o runtime da edge function recebe
-- `sb_secret_…` (41 chars) enquanto a chave legada que se copia do painel é o
-- JWT `eyJ…` (219 chars). São credenciais válidas e diferentes — a comparação
-- nunca bate.
--
-- Um token dedicado sai melhor de qualquer forma: uma tarefa que roda sozinha
-- todo dia deixa de carregar no header uma chave que ignora todo o RLS do
-- projeto, e girar o token é um UPDATE aqui, sem tocar em nada do Supabase.
--
-- O token vai no header `x-sweep-token`, não no `Authorization`: a função é
-- publicada com `verify_jwt` desligado (ela faz a própria autenticação), e usar
-- o campo padrão daria a impressão errada de que existe um JWT sendo validado.

-- Token de 256 bits, criado uma vez. O `if not exists` deixa a migration
-- reaplicável sem trocar o segredo por baixo de um agendamento que já funciona.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'orphan_sweep_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'orphan_sweep_token',
      'Autentica o cron da varredura de imagens órfãs na edge function cleanup-orphan-images'
    );
  end if;
end $$;

/**
 * O token confere? A comparação acontece aqui dentro de propósito: assim o
 * segredo nunca sai do banco para ser conferido do lado de fora.
 */
create or replace function public.orphan_sweep_token_valid(candidate text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select coalesce(candidate, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets
        where name = 'orphan_sweep_token'
          and decrypted_secret = candidate
     );
$$;

-- Só a edge function (service_role) pergunta. Deixar anon/authenticated
-- chamarem transformaria a função num oráculo para adivinhar o token.
revoke all on function public.orphan_sweep_token_valid(text) from public;
revoke all on function public.orphan_sweep_token_valid(text) from anon;
revoke all on function public.orphan_sweep_token_valid(text) from authenticated;
grant execute on function public.orphan_sweep_token_valid(text) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Diário, 04:30 UTC (01:30 em Brasília): fora do horário em que corretor mexe no
-- painel. Não que a carência de 24h dependa disso — mas varredura que apaga
-- arquivo é melhor rodar quando ninguém está cadastrando.
--
-- `net.http_post`, não `extensions.net.http_post`: o pg_net é instalado no
-- schema `extensions`, mas registra as funções dele em `net`.
select cron.unschedule('cleanup-orphan-property-images')
where exists (select 1 from cron.job where jobname = 'cleanup-orphan-property-images');

select cron.schedule(
  'cleanup-orphan-property-images',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://eixzfjmmcocuxnprqskf.supabase.co/functions/v1/cleanup-orphan-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-token',
      coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'orphan_sweep_token'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
