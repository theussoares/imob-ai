-- Ajustes do cliente sobre as páginas internas linkáveis no rodapé.
--
-- Guarda SÓ o que ele mudou (rótulo trocado, página escondida), nunca a lista
-- inteira. A lista de páginas que existem é do código
-- (shared/utils/footer-pages.ts): se fosse copiada para cá, uma página criada
-- depois nunca apareceria para quem já tivesse salvo, e cada cliente ficaria
-- congelado no catálogo do dia em que mexeu na tela.
--
-- Formato: { "/quero-vender": { "label": "Anuncie conosco", "visible": false } }

alter table public.tenants
  add column if not exists footer_pages jsonb not null default '{}'::jsonb;

-- Rodapé é renderizado sem login.
grant select (footer_pages) on public.tenants to anon, authenticated;
