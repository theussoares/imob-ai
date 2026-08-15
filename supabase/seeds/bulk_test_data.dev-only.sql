-- ⚠️  APENAS DESENVOLVIMENTO — NÃO É MIGRATION. Não rode em produção.
--
-- Este arquivo já foi aplicado por engano no tenant `olmi` (cliente real) e teve
-- de ser desfeito pela migration 0010. Antes de rodar, TROQUE o slug abaixo por
-- um tenant descartável (ex.: 'demo') e considere usar status 'draft' — com
-- 'active' os imóveis fictícios vão pro site público, sitemap e llms.txt.
--
-- Massa de dados fictícia para teste (tenant olmi): 10 corretores + 50 imóveis,
-- com os campos internos (location, broker_id, owner_name, owner_phone) preenchidos
-- e 2 imagens (Unsplash) por imóvel. Não afeta o site público — mapper público
-- continua sem expor os campos internos.

-- 10 corretores fictícios
insert into public.brokers (tenant_id, name, phone, email, creci, active)
select t.id, b.name, b.phone, b.email, b.creci, true
from public.tenants t
cross join (values
  ('Ana Beatriz Souza','5567991234501','ana.souza@olmi.com.br','12345-J'),
  ('Bruno Carvalho Lima','5567991234502','bruno.lima@olmi.com.br','12346-J'),
  ('Camila Ferreira Dias','5567991234503','camila.dias@olmi.com.br','12347-J'),
  ('Diego Martins Rocha','5567991234504','diego.rocha@olmi.com.br','12348-J'),
  ('Elaine Cristina Alves','5567991234505','elaine.alves@olmi.com.br','12349-J'),
  ('Fábio Henrique Santos','5567991234506','fabio.santos@olmi.com.br','12350-J'),
  ('Gabriela Nunes Pereira','5567991234507','gabriela.pereira@olmi.com.br','12351-J'),
  ('Henrique Costa Barbosa','5567991234508','henrique.barbosa@olmi.com.br','12352-J'),
  ('Isabela Ramos Teixeira','5567991234509','isabela.teixeira@olmi.com.br','12353-J'),
  ('João Pedro Almeida','5567991234510','joao.almeida@olmi.com.br','12354-J')
) as b(name, phone, email, creci)
where t.slug = 'olmi'
  and not exists (select 1 from public.brokers x where x.tenant_id = t.id and x.name = b.name);

-- 50 imóveis fictícios (code TST-0001..TST-0050), gerados proceduralmente
with tenant as (
  select id from public.tenants where slug = 'olmi'
),
broker_pool as (
  select id, row_number() over (order by name) as rn
  from public.brokers
  where tenant_id = (select id from tenant)
),
gen as (
  select
    n,
    (array['casa','apartamento','sobrado','casa','apartamento','terreno','casa','sobrado'])[(n % 8) + 1] as ptype,
    (array['venda','venda','venda','venda','aluguel'])[(n % 5) + 1] as ppurpose,
    (array[
      'Jardim Alvorada','Centro','Village do Lago','Parque São Carlos','Vila Nova',
      'Nova Três Lagoas','Jardim das Américas','Interlagos','Colinos','Santos Dumont',
      'Quinta da Lagoa','Jardim Paranapunga','Vila Piloto','Jardim Marabá','Cohab'
    ])[(n % 15) + 1] as neighborhood,
    (array[
      'Ana Paula Ribeiro','Carlos Eduardo Nogueira','Beatriz Salgado','Daniel Freitas Moura',
      'Eduarda Lopes Vieira','Felipe Augusto Cardoso','Giovana Torres Machado','Hugo Batista Cunha',
      'Ivone Cristina Barros','Jorge Luiz Pinheiro','Karina Duarte Farias','Leonardo Siqueira Prado',
      'Mariana Aguiar Bezerra','Nelson Rocha Guimarães','Otávio Bandeira Correia','Patrícia Menezes Xavier',
      'Rodrigo Tavares Fonseca','Sandra Lima Peixoto','Thiago Moraes Cavalcante','Vanessa Coutinho Reis'
    ])[(n % 20) + 1] as owner_name,
    (array[
      'Rua das Palmeiras','Rua Sete de Setembro','Avenida Piaraçu','Rua Ceará','Rua Bahia',
      'Rua Rio Grande do Sul','Avenida Capitão Barbosa','Rua Amazonas','Rua Minas Gerais','Rua Paraná'
    ])[(n % 10) + 1] as street,
    (n % 10) as fset
  from generate_series(1, 50) as n
)
insert into public.properties
  (tenant_id, code, title, type, purpose, price, neighborhood, city, state,
   bedrooms, bathrooms, parking, area, high_standard, description, features,
   status, featured, location, broker_id, owner_name, owner_phone)
select
  (select id from tenant),
  'TST-' || lpad(n::text, 4, '0'),
  case ptype
    when 'casa' then 'Casa no ' || neighborhood
    when 'apartamento' then 'Apartamento no ' || neighborhood
    when 'sobrado' then 'Sobrado no ' || neighborhood
    else 'Terreno no ' || neighborhood
  end,
  ptype::property_type,
  ppurpose::property_purpose,
  case
    when ppurpose = 'aluguel' then (900 + (n * 137) % 3200)
    when ptype = 'terreno' then (80000 + (n * 4271) % 320000)
    when ptype = 'sobrado' then (420000 + (n * 5813) % 480000)
    when ptype = 'apartamento' then (180000 + (n * 3719) % 380000)
    else (150000 + (n * 4967) % 420000)
  end,
  neighborhood, 'Três Lagoas', 'MS',
  case when ptype = 'terreno' then 0 else 1 + (n % 4) end,
  case when ptype = 'terreno' then 0 else 1 + (n % 3) end,
  case when ptype = 'terreno' then 0 else (n % 4) end,
  case
    when ptype = 'terreno' then (150 + (n * 37) % 450)
    when ptype = 'apartamento' then (48 + (n * 11) % 90)
    else (75 + (n * 17) % 220)
  end,
  (n % 6 = 0),
  case ptype
    when 'terreno' then 'Terreno plano, documentado, pronto para construir no bairro ' || neighborhood || '.'
    when 'apartamento' then 'Apartamento bem localizado no ' || neighborhood || ', próximo a comércio e serviços.'
    when 'sobrado' then 'Sobrado espaçoso no ' || neighborhood || ', ótimo para famílias grandes.'
    else 'Casa confortável no ' || neighborhood || ', bairro tranquilo e residencial.'
  end,
  case fset
    when 0 then array['Quintal','Churrasqueira','Portão eletrônico']
    when 1 then array['Piscina','Área gourmet','Condomínio fechado']
    when 2 then array['Elevador','Portaria 24h','Sacada']
    when 3 then array['Documentação em dia','Financiável']
    when 4 then array['Academia','Salão de festas','Playground']
    when 5 then array['Energia solar','Escritório','Suíte master']
    when 6 then array['Aceita pet','Cozinha planejada']
    when 7 then array['Esquina','Infraestrutura completa']
    when 8 then array['Closet','Automação','Vista panorâmica']
    else array['Garagem coberta','Quintal amplo']
  end,
  'active'::property_status,
  (n % 7 = 0),
  street || ', ' || (100 + n) || ' - ' || neighborhood,
  (select id from broker_pool where rn = ((n % 10) + 1)),
  owner_name,
  '5567' || (990000000 + n)::text
from gen
on conflict (tenant_id, code) do nothing;

-- 2 imagens (Unsplash) por imóvel de teste
insert into public.property_images (property_id, url, alt, position, is_cover)
select pr.id, img.url, pr.title, img.position, img.is_cover
from public.properties pr
join (
  select
    'TST-' || lpad(n::text, 4, '0') as code,
    (array[
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1598228723793-52759bba239c?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=72&auto=format&fit=crop'
    ])[(n % 12) + 1] as cover_url,
    (array[
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1560184897-ae75f418493e?w=1200&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1600585153490-76fb20a32601?w=1200&q=72&auto=format&fit=crop'
    ])[(n % 12) + 1] as secondary_url
  from generate_series(1, 50) as n
) as urls on pr.code = urls.code
cross join lateral (values
  (0, true, urls.cover_url),
  (1, false, urls.secondary_url)
) as img(position, is_cover, url)
where pr.tenant_id = (select id from public.tenants where slug = 'olmi')
  and not exists (select 1 from public.property_images pi where pi.property_id = pr.id);
