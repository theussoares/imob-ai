-- Triagem automática no WhatsApp: três perguntas fixas antes do corretor.
--
-- O sintoma: a mensagem que chega às 21h ("oi, vi o anúncio") espera até as
-- 9h do dia seguinte sem resposta nenhuma, e o corretor abre a conversa sem
-- saber se a pessoa quer comprar, alugar ou vender, nem quanto pode gastar. É o
-- lead que esfria mais rápido.
--
-- Fluxo FIXO (botões e lista), não IA: a Meta proíbe chatbot de IA de uso
-- geral na API desde 15/01/2026, e o que a imobiliária pequena precisa é o
-- básico perguntado sempre do mesmo jeito. Desligado por padrão.
-- Ver docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md, item 17.
--
-- Idempotente: seguro rodar de novo.

alter table public.whatsapp_accounts add column if not exists triagem text not null default 'desligada';
alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_triagem_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_triagem_check
  check (triagem in ('desligada', 'fora_do_horario', 'sempre'));

-- Onde a conversa está no fluxo. null = a triagem nunca começou nela.
alter table public.whatsapp_conversations add column if not exists triagem_passo text;
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_triagem_passo_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_triagem_passo_check
  check (triagem_passo is null or triagem_passo in ('tipo', 'faixa', 'regiao', 'concluida', 'interrompida'));
-- As respostas até o fim do fluxo, quando viram anotação no contato. Somem
-- com a conversa (retenção da 0059).
alter table public.whatsapp_conversations add column if not exists triagem_tipo text;
alter table public.whatsapp_conversations add column if not exists triagem_faixa text;
-- Quantas respostas fora do roteiro seguidas: na segunda, a triagem desiste
-- e deixa para o corretor, em vez de insistir com quem não quer botão.
alter table public.whatsapp_conversations add column if not exists triagem_tentativas integer not null default 0;
-- Última pergunta do robô, para desistir de quem sumiu.
alter table public.whatsapp_conversations add column if not exists triagem_em timestamptz;

-- Mensagem do robô tem origem própria: não é resposta de pessoa, e o painel
-- de desempenho e a "primeira resposta" não podem contá-la como se fosse.
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_origin_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_origin_check
  check (origin in ('contato', 'painel', 'app', 'bot'));
