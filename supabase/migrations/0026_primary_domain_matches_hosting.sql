-- Corrige qual domínio é o primário: tem que ser o que a hospedagem ENTREGA.
--
-- A Vercel está configurada com o apex redirecionando para o www, nos dois
-- clientes com domínio próprio. Medido em produção:
--   https://tpimobiliaria.com.br/  ->  308  ->  https://www.tpimobiliaria.com.br/
-- e o painel da Vercel mostra o mesmo para olmiimoveis.com.br.
--
-- Com o apex marcado como primário (como as migrations 0014 e 0025 fizeram), o
-- middleware de host canônico mandaria www -> apex e a hospedagem devolveria
-- apex -> www: laço infinito, site fora do ar. O código ganhou trava para isso
-- na mesma leva (diferença só no "www." nunca vira redirect), mas o dado
-- também precisa refletir a realidade — senão o redirect do subdomínio antigo
-- cai no apex e gasta um salto a mais até o destino final.
--
-- ATENÇÃO para quem mexer nisto depois: `is_primary` precisa apontar para o
-- host que a hospedagem serve de fato, não para o que parece mais bonito. Se um
-- dia a Vercel passar a preferir o apex, esta migration se inverte.
update public.tenant_domains set is_primary = false
where domain in ('tpimobiliaria.com.br', 'olmiimoveis.com.br');

update public.tenant_domains set is_primary = true
where domain in ('www.tpimobiliaria.com.br', 'www.olmiimoveis.com.br');
