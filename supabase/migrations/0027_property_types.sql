-- Novos tipos de imóvel: barracão, sala, salão, prédio, kitnet, chácara, rancho.
--
-- `properties.type` é um ENUM do Postgres (`create type property_type`, na
-- 0001), não um texto com CHECK. Sem estes ALTERs, salvar um imóvel do tipo
-- novo falha com "invalid input value for enum property_type" — o formulário
-- do painel ofereceria a opção e o salvar quebraria.
--
-- `if not exists` deixa a migration idempotente. Cada ALTER vem sozinho porque
-- o Postgres não aceita adicionar vários valores de enum num comando só.
--
-- A chave é sem acento de propósito: ela é gravada aqui E entra na URL pública
-- do imóvel (/barracao-centro/VD-010). Os acentos ficam no rótulo, em
-- shared/models/property-type.ts, que é a fonte única do resto.
alter type property_type add value if not exists 'kitnet';
alter type property_type add value if not exists 'chacara';
alter type property_type add value if not exists 'rancho';
alter type property_type add value if not exists 'barracao';
alter type property_type add value if not exists 'sala';
alter type property_type add value if not exists 'salao';
alter type property_type add value if not exists 'predio';
