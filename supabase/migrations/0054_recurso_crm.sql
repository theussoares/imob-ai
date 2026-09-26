-- CRM (histórico do lead, agenda, roleta) passa a ser recurso por imobiliária.
--
-- O motivo: o CRM da 0049 entrou na develop para toda imobiliária, sem flag,
-- e o release para a main o levaria a todos os clientes em produção — quando
-- ele é, por ora, só para demonstração. Sem a linha `crm` em `tenant_features`,
-- o painel continua como está em produção: "Anotações" e "Próximo retorno" na
-- ficha do contato, sem Agenda e sem roleta.
--
-- Só a constraint. As tabelas da 0049 continuam valendo para todos: o retorno
-- do modo antigo vira tarefa por baixo (é daí que `next_contact_at` é derivado),
-- e ligar o recurso depois não perde nada do que foi agendado.
--
-- ⚠️ Escrita por extenso, pelo mesmo motivo da 0045: recriar a constraint sem
-- um dos valores existentes DESLIGA aquele recurso de toda imobiliária que paga.
--
-- Ligar para uma imobiliária (ex.: a da demonstração):
--   insert into public.tenant_features (tenant_id, feature, enabled)
--   values ('<tenant_id>', 'crm', true)
--   on conflict (tenant_id, feature) do update set enabled = true;
--
-- Idempotente: seguro rodar de novo.

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai', 'crm'));
