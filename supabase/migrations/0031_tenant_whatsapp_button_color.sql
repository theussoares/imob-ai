-- Cor customizável do botão de WhatsApp, por imobiliária.
--
-- Nullable e sem default (diferente de brand_primary/brand_accent): a
-- maioria dos tenants não vai mexer nisso, e o verde padrão do WhatsApp
-- (`--wa` em main.css) já é a cor esperada por quem usa o app — só grava
-- quando o cliente pede uma cor própria. Mesmo raciocínio do favicon_url.
--
-- Sem GRANT: `tenants` tem SELECT no nível da tabela para o anon, então
-- coluna nova já entra visível.
alter table public.tenants
  add column if not exists whatsapp_button_color text;
