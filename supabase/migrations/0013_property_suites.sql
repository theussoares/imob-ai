-- Suítes: um imóvel pode ter, além dos quartos, N suítes (quarto com banheiro
-- próprio). Ex.: 3 quartos sendo 2 suítes. Coluna nova, default 0 — imóveis
-- existentes ficam sem suíte até serem editados.
alter table public.properties
  add column if not exists suites integer not null default 0;

-- properties usa privacidade por-coluna (ver 0005): o anon só enxerga colunas
-- públicas via grant explícito. Coluna nova não herda grant, então sem isto o
-- catálogo público quebra com "permission denied for table properties".
grant select (suites) on public.properties to anon;
