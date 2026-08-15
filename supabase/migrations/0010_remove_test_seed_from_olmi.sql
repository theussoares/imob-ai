-- Remove a massa de dados FICTÍCIA do tenant OLMI (cliente real).
--
-- A migration 0006 semeou 50 imóveis (TST-0001..TST-0050) + 10 corretores
-- fictícios para teste de volume, mas foi aplicada no tenant `olmi`, que é de um
-- cliente real — os imóveis falsos (com nome e WhatsApp de proprietário
-- inventados) ficam visíveis no site público do cliente.
--
-- Escopo estrito: só remove o que a 0006 criou (códigos TST-* e os 10 corretores
-- pelo nome exato). Não toca em nenhum imóvel real (ex.: NC-123).

-- Imagens dos imóveis de teste (FK depende delas primeiro).
delete from public.property_images pi
using public.properties p
where pi.property_id = p.id
  and p.code like 'TST-%'
  and p.tenant_id = (select id from public.tenants where slug = 'olmi');

-- Imóveis de teste.
delete from public.properties
where code like 'TST-%'
  and tenant_id = (select id from public.tenants where slug = 'olmi');

-- Corretores fictícios (nomes exatos inseridos pela 0006).
delete from public.brokers
where tenant_id = (select id from public.tenants where slug = 'olmi')
  and name in (
    'Ana Beatriz Souza',
    'Bruno Carvalho Lima',
    'Camila Ferreira Dias',
    'Diego Martins Rocha',
    'Elaine Cristina Alves',
    'Fábio Henrique Santos',
    'Gabriela Nunes Pereira',
    'Henrique Costa Barbosa',
    'Isabela Ramos Teixeira',
    'João Pedro Almeida'
  );
