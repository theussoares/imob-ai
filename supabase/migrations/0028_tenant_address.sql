-- Endereço estruturado da imobiliária, para exibir a localização no site
-- (rodapé, com mapa) e alimentar o schema.org (PostalAddress + GeoCoordinates).
--
-- Até aqui só existia city/state (texto livre, da 0001). Suficiente para "atende
-- em Três Lagoas/MS", mas não dá para desenhar um mapa nem para o Google mostrar
-- um endereço completo no resultado de busca. Colunas novas em vez de reaproveitar
-- city/state: são dados de granularidade diferente (rua/número/bairro/CEP) e o
-- que já existe continua servindo sozinho quando a imobiliária não quiser
-- detalhar o endereço.
--
-- Latitude/longitude ficam soltas (não um POINT/geography do PostGIS): não há
-- nenhuma consulta espacial no produto (raio, distância), só exibição de um
-- pino no mapa — um extra do Postgres sem uso real seria complexidade à toa.
alter table public.tenants
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_zip text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Endereço aparece no rodapé do site sem login, igual footer_text/footer_pages.
grant select (
  address_street, address_number, address_complement, address_neighborhood,
  address_zip, latitude, longitude
) on public.tenants to anon, authenticated;
