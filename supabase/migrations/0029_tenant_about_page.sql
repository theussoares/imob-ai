-- Conteúdo da página "Quem somos", editável pelo painel.
--
-- JSONB com uma lista de blocos, e não colunas fixas (título/texto/foto): o
-- conteúdo real dessa página ainda vai ser definido (modelos vêm depois), e o
-- que já dá para saber hoje é que ele é uma sequência ordenada de pedaços
-- (título, texto, imagem, destaque em número) que a imobiliária monta e
-- reordena — o mesmo raciocínio de footer_links (0021): poucos itens, editados
-- juntos, ordem é a do array. Tabela própria (uma linha por bloco) só valeria
-- se algo precisasse consultar um bloco isolado, o que não é o caso.
--
-- Formato: { "blocks": [ { "type": "heading" | "text" | "image" | "stat", ... } ] }
-- Ver shared/models/about-page.ts para os campos de cada tipo, e
-- shared/utils/about-content.ts para o saneador que roda antes de gravar e ao ler.
alter table public.tenants
  add column if not exists about_content jsonb not null default '{"blocks": []}'::jsonb;

-- Página pública ("Quem somos"), lida sem login — mesmo motivo de footer_pages.
grant select (about_content) on public.tenants to anon, authenticated;
