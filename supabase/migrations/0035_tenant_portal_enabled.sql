-- Interruptor de EXIBIÇÃO da Área do Cliente no site público.
--
-- ⚠️ Isto NÃO é o entitlement de segurança. O plano decidiu (11/09) que a Área
-- do Cliente é plano pago, controlada por uma tabela `tenant_features` lida
-- dentro de `is_portal_user()` — de modo que o recurso desligado feche o acesso
-- NO BANCO, em todo caminho. Essa tabela nunca foi criada nem virou card.
--
-- Esta coluna resolve outro problema, menor e imediato: sem ela, o link "Área
-- do Cliente" no header e no rodapé apareceria no site de TODA imobiliária,
-- levando o visitante a um login onde ninguém tem conta.
--
-- Nasce `false` de propósito: ninguém ganha o link sem alguém ligar.
--
-- O dia em que `tenant_features` existir, esta coluna vira derivada dele (ou
-- some). Até lá, não confunda as duas: desligar aqui tira o link do site, não
-- fecha o portal.
--
-- Idempotente: seguro rodar de novo.

alter table public.tenants
  add column if not exists portal_enabled boolean not null default false;

comment on column public.tenants.portal_enabled is
  'Anuncia a Área do Cliente no site público (header e rodapé). NÃO é controle de acesso — ver 0035.';
