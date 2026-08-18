-- Lista fechada de `source`. RODE ESTA MIGRATION SÓ DEPOIS DO DEPLOY.
--
-- Separada da 0017 por causa de um incidente: a 0017 original já trazia este
-- CHECK, foi aplicada antes do deploy, e o código que estava no ar gravava
-- `source = 'form'` — valor fora da lista. Resultado: toda tentativa de contato
-- no site público virou erro 500 até a constraint ser removida.
--
-- A regra que sai disso: adicionar coluna é compatível com a versão anterior e
-- pode ir antes do deploy; APERTAR valores aceitos não é, e tem que ir depois.
-- Uma constraint nova é um contrato que o código já no ar precisa cumprir.

-- Varre de novo o que a versão antiga gravou entre a 0017 e o deploy.
update public.leads set source = 'property_page' where source = 'form';

update public.leads
set source = 'outro'
where source not in (
  'property_page', 'catalog_empty', 'catalog_footer', 'quero_vender', 'manual', 'outro'
);

alter table public.leads
  drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
  check (source in (
    'property_page', 'catalog_empty', 'catalog_footer', 'quero_vender', 'manual', 'outro'
  ));

-- O default antigo ('form') deixaria de ser válido. Todo caminho de escrita já
-- informa a origem explicitamente; o default é só a rede de segurança.
alter table public.leads alter column source set default 'outro';
