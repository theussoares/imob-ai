-- Favicon próprio por imobiliária.
--
-- A rota `/favicon.svg` gera um ícone com a inicial do nome sobre a cor da
-- marca, e o comentário dela já previa este campo: "quando existir campo próprio
-- de favicon no painel, ele passa a ter prioridade e isto continua como
-- fallback".
--
-- Usar a logo cadastrada não serve, e agora com dado: as duas logos reais são
-- 256x114 (2,25:1) e 256x85 (3:1) — retângulo largo com texto, que a 16px vira
-- mancha. Este campo é para uma marca quadrada, pensada para ícone.
--
-- Sem GRANT: `tenants` tem SELECT no nível da tabela para o anon, então coluna
-- nova já entra visível. É diferente de `properties`, que tem privacidade por
-- coluna e exige grant explícito a cada coluna pública nova.
alter table public.tenants
  add column if not exists favicon_url text;
