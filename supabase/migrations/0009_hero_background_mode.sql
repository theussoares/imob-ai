-- Hero v2: terceiro modo de layout — foto como fundo (full-bleed) com o texto
-- sobreposto, em vez de só "ao lado" (left/right).
alter table public.tenants drop constraint if exists tenants_hero_image_position_check;
alter table public.tenants
  add constraint tenants_hero_image_position_check
  check (hero_image_position in ('left', 'right', 'background'));

-- OLMI usa o modo "fundo" (pedido do cliente).
update public.tenants set hero_image_position = 'background' where slug = 'olmi';
