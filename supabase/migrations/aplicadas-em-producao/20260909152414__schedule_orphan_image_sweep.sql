-- ⚠️ IMPORTADA DA PRODUÇÃO — não foi escrita aqui.
--
-- Aplicada direto no banco em 2026-09-09, sem nunca
-- ter sido commitada. Recuperada de `supabase_migrations.schema_migrations`
-- em 2026-09-16, com o SQL exatamente como foi executado.
--
-- Identidade no banco: version=20260909152414, name=schedule_orphan_image_sweep
--
-- ⚠️ Cria um segredo no Vault e agenda um cron. Reaplicar é especialmente ruim
-- aqui: o `if not exists` protege o segredo, mas o `cron.schedule` reescreveria
-- o agendamento. A URL do projeto está fixa no corpo, como foi aplicada.
--
-- NÃO reaplicar: já está no histórico da produção. Este arquivo existe para que
-- a pasta pare de mentir sobre o banco. Ver o README desta pasta.

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

revoke all on function public.orphan_sweep_token_valid(text) from public;
revoke all on function public.orphan_sweep_token_valid(text) from anon;
revoke all on function public.orphan_sweep_token_valid(text) from authenticated;
grant execute on function public.orphan_sweep_token_valid(text) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('cleanup-orphan-property-images')
where exists (select 1 from cron.job where jobname = 'cleanup-orphan-property-images');

select cron.schedule(
  'cleanup-orphan-property-images',
  '30 4 * * *',
  $CRON$
  select net.http_post(
    url := 'https://eixzfjmmcocuxnprqskf.supabase.co/functions/v1/cleanup-orphan-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-token',
      coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'orphan_sweep_token'), '')
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
