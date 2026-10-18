-- Importação do histórico do app WhatsApp Business (Coexistence).
--
-- O sintoma: quem conecta o número que já usa no celular chega ao painel com
-- a caixa de entrada vazia — as conversas em andamento, com os clientes de
-- ontem, ficavam só no celular, e o corretor continuava lá "para ver o que foi
-- falado". A Meta entrega até 6 meses de histórico, mas só se pedido em até 24h
-- depois da conexão.
--
-- É também o ponto mais delicado de LGPD do recurso: o histórico traz conversa
-- PESSOAL de quem nunca foi cliente. Por isso a importação é decisão explícita
-- do owner (a imobiliária é a controladora), registrada com quem e quando, e o
-- padrão é importar só as conversas de quem já é contato no funil. Ver
-- docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md, item 13.
--
-- Idempotente: seguro rodar de novo.

alter table public.whatsapp_accounts add column if not exists coexistence boolean not null default false;
-- Quando o número foi conectado (ou reconectado). O prazo de 24h da Meta
-- conta daqui; `created_at` não serve, porque reconectar reaproveita a linha.
alter table public.whatsapp_accounts add column if not exists connected_at timestamptz;

-- 'so_leads': só conversas de telefones que já são contato no funil.
-- 'tudo': todas; as sem contato caem na retenção de 90 dias como qualquer outra.
alter table public.whatsapp_accounts add column if not exists history_mode text;
alter table public.whatsapp_accounts add column if not exists history_status text;
alter table public.whatsapp_accounts add column if not exists history_requested_at timestamptz;
-- O aceite. Quem decidiu importar conversa de terceiros precisa estar
-- registrado — é o que a imobiliária mostra se um titular perguntar.
alter table public.whatsapp_accounts add column if not exists history_consent_by uuid references auth.users(id) on delete set null;
alter table public.whatsapp_accounts add column if not exists history_consent_at timestamptz;

alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_history_mode_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_history_mode_check
  check (history_mode is null or history_mode in ('so_leads', 'tudo'));

alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_history_status_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_history_status_check
  check (history_status is null or history_status in ('solicitado', 'recebendo', 'concluido', 'recusado', 'falhou'));

-- Pedido sem aceite registrado não pode existir — nem por um bug do servidor.
alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_history_consent_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_history_consent_check
  check (history_mode is null or (history_consent_by is not null and history_consent_at is not null));

-- Mensagem que veio do histórico, e não chegou ao vivo. Serve para a tela
-- dizer "importada" e para responder, se perguntarem, de onde ela saiu.
alter table public.whatsapp_messages add column if not exists imported boolean not null default false;
