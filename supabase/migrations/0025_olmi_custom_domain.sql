-- Domínio próprio da OLMI Imóveis.
--
-- Mesmo desenho da 0014 (Tatiane). Precisa existir ANTES de o DNS propagar: sem
-- a linha em tenant_domains o host não é reconhecido e o middleware cai na
-- landing da plataforma — ou seja, o domínio novo mostraria a LP da Moradi em
-- vez do site da OLMI.
--
-- O apex sozinho já cobriria o www (resolveTenantForHost tira o "www." e tenta
-- de novo), mas registramos os dois explicitamente para não depender disso.
--
-- painel.olmiimoveis.com.br NÃO precisa de linha aqui: `resolveTenantForHost`
-- tira o prefixo `painel.` e resolve pelo domínio-base. Basta adicionar o
-- subdomínio como domínio do projeto na Vercel.
insert into public.tenant_domains (tenant_id, domain, is_primary)
select t.id, d.domain, d.is_primary
from public.tenants t
join (values
  ('olmiimoveis.com.br', true),
  ('www.olmiimoveis.com.br', false)
) as d(domain, is_primary) on true
where t.slug = 'olmi'
on conflict (domain) do nothing;

-- O subdomínio da plataforma deixa de ser candidato a primário (metadado; não
-- afeta o roteamento, que é sempre por host). Hoje a OLMI não tem nenhum
-- primário marcado, então isto é idempotente — fica explícito para quando
-- alguém reler e comparar com a 0014.
update public.tenant_domains
set is_primary = false
where domain = 'olmi.usemoradi.com.br';
