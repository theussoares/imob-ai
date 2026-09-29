-- Quando chegou a primeira mensagem AO VIVO da conversa — a base do tempo de
-- primeira resposta que o painel de desempenho mostra ao dono.
--
-- O sintoma: o tempo era medido desde `created_at` da conversa. Com a
-- importação do histórico (0061), uma conversa nasce agora com mensagens de
-- meses atrás, e a primeira resposta ao vivo dela entraria na média como se o
-- cliente tivesse esperado minutos. E uma conversa que a imobiliária começou
-- (modelo para um contato do formulário) contaria "espera" antes de o cliente
-- sequer ter escrito.
--
-- `first_inbound_at` só é preenchida por mensagem do contato que chegou pelo
-- webhook ao vivo; o histórico nunca a toca.
--
-- Idempotente: seguro rodar de novo.

alter table public.whatsapp_conversations add column if not exists first_inbound_at timestamptz;

-- O painel de desempenho lê "conversas cuja primeira mensagem ao vivo caiu no
-- período", por tenant.
create index if not exists whatsapp_conversations_tenant_first_inbound_idx
  on public.whatsapp_conversations (tenant_id, first_inbound_at desc)
  where first_inbound_at is not null;
