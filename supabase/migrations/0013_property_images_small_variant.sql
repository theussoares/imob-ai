-- Variante pequena (640px, WebP) de cada foto de imóvel, para servir via srcset.
-- Nullable de propósito: imagens antigas e as adicionadas por URL externa não têm
-- derivada — nesses casos o front cai na `url` original.
alter table public.property_images
  add column if not exists url_sm text;
