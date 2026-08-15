-- Domínio próprio da Tatiane (TP Imobiliária).
--
-- Precisa existir ANTES de o DNS propagar: sem a linha em tenant_domains, o host
-- não é reconhecido e o middleware cai na landing da plataforma (comportamento
-- introduzido em 0011/refactor de tenant) — ou seja, o domínio dela mostraria a
-- LP da Moradi em vez do site dela.
--
-- O apex sozinho já cobriria o www (resolveTenantForHost tira o "www." e tenta de
-- novo), mas registramos os dois explicitamente para não depender disso.
--
-- painel.tpimobiliaria.com.br NÃO precisa de linha aqui: é convenção da
-- plataforma e resolve pelo domínio-base (mesmo mecanismo do "www."). Basta
-- adicionar o subdomínio como domínio do projeto na Vercel.
insert into public.tenant_domains (tenant_id, domain, is_primary)
select t.id, d.domain, d.is_primary
from public.tenants t
join (values
  ('tpimobiliaria.com.br', true),
  ('www.tpimobiliaria.com.br', false)
) as d(domain, is_primary) on true
where t.slug = 'tatiane'
on conflict (domain) do nothing;

-- O subdomínio da plataforma deixa de ser o primário (metadado; não afeta o
-- roteamento, que é sempre por host).
update public.tenant_domains
set is_primary = false
where domain = 'tatiane.usemoradi.com.br';
