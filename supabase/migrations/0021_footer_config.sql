-- Rodapé configurável: texto próprio e links extras por imobiliária.
--
-- Motivo do texto: a frase do rodapé estava fixa no componente, igual em todos
-- os clientes. Dois sites nossos, domínios diferentes, a mesma frase — genérico
-- para quem lê e conteúdo duplicado entre clientes.
--
-- Motivo dos links: não havia caminho para a imobiliária apontar para páginas
-- próprias (política de privacidade, sobre) nem para links extras.

alter table public.tenants
  add column if not exists footer_text text,
  -- JSONB e não tabela nova: são poucos itens, editados juntos, e a ordem é a do
  -- array. Tabela separada só valeria se fosse preciso consultar link isolado.
  add column if not exists footer_links jsonb not null default '[]'::jsonb;

-- Sem CHECK sobre o conteúdo do JSONB. A validação que importa é o esquema da
-- URL (nada de `javascript:`), e ela é regra de aplicação — expressá-la em SQL
-- ficaria ilegível e desatualizaria em relação ao código. Ver
-- shared/utils/footer-links.ts, que roda no servidor antes de gravar.

-- Colunas públicas: o rodapé aparece no site sem login, então o papel anon
-- precisa lê-las. (As demais colunas de tenants já são legíveis por ele.)
grant select (footer_text, footer_links) on public.tenants to anon, authenticated;
