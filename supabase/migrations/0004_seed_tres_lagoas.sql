-- Primeiro tenant (dados extraídos da demo "Imóveis Três Lagoas")
insert into public.tenants
  (slug, name, tagline, hero_title, hero_subtitle, whatsapp, phone, email, creci, city, state, brand_primary, brand_accent, active)
values
  ('tres-lagoas', 'Imóveis Três Lagoas', 'Compra · Venda · Locação — MS',
   'Encontre o imóvel certo sem rodeios.',
   'Casas, apartamentos e terrenos à venda e para alugar. Filtre pelo que importa e fale direto com o corretor.',
   '5567991512269', '+5567991512269', 'contato@imoveis3lagoas.com.br', '000-J',
   'Três Lagoas', 'MS', '#0f3d38', '#c2410c', true)
on conflict (slug) do nothing;

insert into public.tenant_domains (tenant_id, domain, is_primary)
select t.id, d.domain, d.is_primary
from public.tenants t
join (values
  ('imoveis3lagoas.com.br', true),
  ('localhost', false),
  ('127.0.0.1', false)
) as d(domain, is_primary) on true
where t.slug = 'tres-lagoas'
on conflict (domain) do nothing;

insert into public.properties
  (tenant_id, code, title, type, purpose, price, neighborhood, city, state,
   bedrooms, bathrooms, parking, area, high_standard, description, features, status, featured)
select (select id from public.tenants where slug = 'tres-lagoas'),
       p.code, p.title, p.type::property_type, p.purpose::property_purpose, p.price,
       p.neighborhood, 'Três Lagoas', 'MS',
       p.bedrooms, p.bathrooms, p.parking, p.area, p.high_standard, p.description, p.features,
       'active'::property_status, p.featured
from (values
  ('NC-0231','Casa no Jardim Alvorada','casa','venda',320000,'Jardim Alvorada',3,2,2,126,false,
    'Casa térrea bem conservada, ótima iluminação natural e quintal amplo. Financiamento facilitado.',
    array['Quintal amplo','Churrasqueira','Portão eletrônico','Área de serviço'],false),
  ('NC-0244','Apartamento no Centro','apartamento','venda',245000,'Centro',2,1,1,68,false,
    'Apartamento no coração da cidade, próximo ao comércio e serviços. Pronto para morar.',
    array['Elevador','Portaria','Sacada','Próximo ao centro'],false),
  ('NC-0258','Sobrado no Village do Lago','sobrado','venda',690000,'Village do Lago',4,4,4,280,true,
    'Sobrado alto padrão em condomínio, acabamento premium, área gourmet e piscina. Vista para o lago.',
    array['Piscina','Área gourmet','Condomínio fechado','Automação','Closet'],true),
  ('NC-0267','Casa no Parque São Carlos','casa','aluguel',1850,'Parque São Carlos',2,1,1,74,false,
    'Casa para locação em bairro tranquilo e residencial. Aceita pet mediante análise.',
    array['Aceita pet','Quintal','Cozinha planejada'],false),
  ('NC-0275','Apartamento na Vila Nova','apartamento','aluguel',1250,'Vila Nova',2,1,1,55,false,
    'Apartamento compacto e funcional, ideal para casal. Condomínio com baixo custo.',
    array['Condomínio baixo','Sacada','Área comum'],false),
  ('NC-0281','Casa em Nova Três Lagoas','casa','venda',189000,'Nova Três Lagoas',2,1,2,88,false,
    'Casa já financiada, repasse sem burocracia. Excelente oportunidade para primeiro imóvel.',
    array['Repasse de financiamento','Documentação em dia','Garagem coberta'],false),
  ('NC-0290','Casa no Jardim das Américas','casa','venda',455000,'Jardim das Américas',3,3,2,170,true,
    'Casa espaçosa com suíte master, escritório e área de lazer completa. Bairro valorizado.',
    array['Suíte master','Escritório','Área de lazer','Energia solar'],true),
  ('NC-0303','Terreno no Interlagos','terreno','venda',135000,'Interlagos',0,0,0,250,false,
    'Terreno plano, pronto para construir, em loteamento com infraestrutura completa.',
    array['Plano','Documentado','Infraestrutura pronta','Esquina'],false),
  ('NC-0312','Apartamento no Colinos','apartamento','venda',390000,'Colinos',3,2,2,92,false,
    'Apartamento novo com varanda gourmet, lazer completo no condomínio e ótima planta.',
    array['Varanda gourmet','Piscina','Academia','Salão de festas'],false),
  ('NC-0327','Casa no Santos Dumont','casa','aluguel',2400,'Santos Dumont',3,2,2,140,false,
    'Casa ampla para locação, ideal para família. Próxima a escolas e mercado.',
    array['3 dormitórios','Quintal grande','Perto de escolas'],false),
  ('NC-0339','Sobrado na Quinta da Lagoa','sobrado','venda',520000,'Quinta da Lagoa',3,3,3,210,true,
    'Sobrado moderno em condomínio de alto padrão, com pé-direito duplo e área gourmet integrada.',
    array['Pé-direito duplo','Condomínio fechado','Área gourmet','Suítes'],true),
  ('NC-0351','Casa no Jardim Paranapunga','casa','venda',275000,'Jardim Paranapunga',3,2,2,110,false,
    'Casa com 3 quartos sendo 1 suíte, cozinha planejada e quintal. Financiável.',
    array['1 suíte','Cozinha planejada','Financiável','Quintal'],false)
) as p(code, title, type, purpose, price, neighborhood, bedrooms, bathrooms, parking, area, high_standard, description, features, featured)
on conflict (tenant_id, code) do nothing;

insert into public.property_images (property_id, url, alt, position, is_cover)
select pr.id, img.url, pr.title, img.position, img.is_cover
from public.properties pr
join (values
  ('NC-0231','https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0231','https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0244','https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0244','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0258','https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0258','https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0267','https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0267','https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0275','https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0275','https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0281','https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0281','https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0290','https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0290','https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0303','https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0303','https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0312','https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0312','https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0327','https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0327','https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0339','https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0339','https://images.unsplash.com/photo-1600585153490-76fb20a32601?w=1200&q=72&auto=format&fit=crop',1,false),
  ('NC-0351','https://images.unsplash.com/photo-1598228723793-52759bba239c?w=1200&q=72&auto=format&fit=crop',0,true),
  ('NC-0351','https://images.unsplash.com/photo-1560184897-ae75f418493e?w=1200&q=72&auto=format&fit=crop',1,false)
) as img(code, url, position, is_cover) on img.code = pr.code
where pr.tenant_id = (select id from public.tenants where slug = 'tres-lagoas')
  and not exists (select 1 from public.property_images pi where pi.property_id = pr.id);
