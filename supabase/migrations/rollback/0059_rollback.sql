-- Rollback da 0059: volta a regra única de contato (WhatsApp no captador, nome
-- escondido). Rode só com o código anterior à 0059 em produção — o atual lê as
-- duas colunas a cada página de imóvel.

alter table public.tenants drop constraint if exists tenants_whatsapp_target_check;
alter table public.tenants drop column if exists whatsapp_target;
alter table public.tenants drop column if exists listing_broker_visible;
