-- Conteúdo do hero v2 pro tenant OLMI (institucional): texto + foto placeholder
-- (trocar depois pela foto real da imobiliária via painel — Configurações > Hero).
update public.tenants
set
  tagline = 'Compra · Venda · Locação — Três Lagoas/MS',
  hero_title = 'A imobiliária que conhece Três Lagoas de verdade.',
  hero_subtitle = 'Atendimento próximo e conhecimento local pra te ajudar a comprar, vender ou alugar com segurança.',
  hero_image = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=1200&q=75&auto=format&fit=crop',
  hero_image_position = 'right',
  city = coalesce(nullif(city, ''), 'Três Lagoas'),
  state = coalesce(nullif(state, ''), 'MS')
where slug = 'olmi';
