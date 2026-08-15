-- Restaura a leitura pública das colunas normais de properties para o papel anon.
-- Um REVOKE aplicado direto no banco (fora de migration) para proteger os campos
-- internos (location, broker_id, owner_name, owner_phone) removeu o SELECT da
-- tabela inteira para anon, derrubando o catálogo público. Aqui concedemos SELECT
-- explicitamente só nas colunas públicas — as 4 colunas internas ficam de fora,
-- e a RLS policy "properties_public_read" continua controlando quais linhas
-- (status = 'active') são visíveis.
grant select (
  id, tenant_id, code, title, type, purpose, price,
  neighborhood, city, state, bedrooms, bathrooms, parking, area,
  high_standard, description, features, status, featured,
  created_at, updated_at
) on public.properties to anon;
