-- Perfil público (opt-in) do corretor, para o bloco "carrossel de corretores"
-- da página "Quem somos".
--
-- Até aqui `brokers` era só CRM interno: a 0011 bloqueou de propósito toda
-- leitura pública da tabela ("revoke all on public.brokers from anon"), porque
-- expor nome/telefone/e-mail de TODOS os corretores de TODOS os tenants nunca
-- foi a intenção — o único vazamento aceito é o telefone do captador, numa
-- página de imóvel específica (ver fetchBrokersById/publicBrokerPhone).
--
-- Uma vitrine de equipe é outra categoria de dado: o corretor decide aparecer,
-- com foto e minibio — nunca telefone/e-mail. `public_visible` é esse
-- interruptor, false por padrão: corretor cadastrado hoje continua invisível
-- até a pessoa marcar a opção no painel.
alter table public.brokers
  add column if not exists photo_url text,
  add column if not exists bio text,
  add column if not exists public_visible boolean not null default false;

-- Só quem optou E está ativo. Nunca telefone/e-mail aqui — só o que a vitrine
-- realmente mostra.
grant select (id, name, photo_url, bio, creci) on public.brokers to anon, authenticated;

create policy "brokers_public_read" on public.brokers
  for select using (active = true and public_visible = true);
