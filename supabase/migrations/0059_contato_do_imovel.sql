-- Contato na página do imóvel passa a ser escolha de cada imobiliária.
--
-- Até aqui a regra era uma só para todos: se o imóvel tem captador ativo com
-- telefone, o botão de WhatsApp vai para o celular dele; o nome dele nunca
-- aparece. Um cliente pediu o inverso (mostrar quem captou, mas o WhatsApp
-- sempre no número da imobiliária), e outros querem as outras combinações.
-- São dois eixos independentes, então são duas colunas — um enum de quatro
-- valores juntaria "o que o visitante vê" com "para onde a conversa vai", e a
-- tela do painel teria de explicar o produto cartesiano.
--
-- Os defaults reproduzem o comportamento de produção (captador escondido,
-- WhatsApp no captador): aplicar esta migration não muda o site de ninguém.
--
-- ⚠️ ORDEM DE DEPLOY — migration ANTES do código. O código novo lê as duas
-- colunas em toda página de imóvel, no catálogo e no clique do WhatsApp; sem
-- elas o PostgREST responde "column does not exist" e o detalhe de todo
-- imóvel de todo cliente vira 500. O inverso é seguro: colunas novas com
-- default não incomodam o código antigo.
--
-- Fora do grant por coluna do anon (0047) de propósito. Quem decide é o
-- servidor, lendo com a service_role; o navegador recebe só o resultado. Se o
-- anon lesse a configuração, o site passaria a precisar dela para montar o
-- link, e um tenant com WhatsApp na imobiliária voltaria a mandar o celular do
-- corretor no payload "só para o cliente decidir".
--
-- Sem RLS nova: `tenants` já tem RLS e as policies de escrita do painel; a
-- coluna herda as duas.

alter table public.tenants
  add column if not exists listing_broker_visible boolean not null default false;

alter table public.tenants
  add column if not exists whatsapp_target text not null default 'captador';
alter table public.tenants drop constraint if exists tenants_whatsapp_target_check;
alter table public.tenants add constraint tenants_whatsapp_target_check
  check (whatsapp_target in ('captador', 'imobiliaria'));
