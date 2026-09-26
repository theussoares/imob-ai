-- Cobrança (boleto e Pix pelo Asaas, repasse ao proprietário) passa a ser
-- recurso próprio, separado da Área do Cliente.
--
-- O motivo: `portal` já está ligado para imobiliária de verdade (a OLMI), que
-- usa Contratos, Clientes e a Área do Cliente em produção. A cobrança da
-- 0041/0051 entrou atrás de `portal`, e o release a mostraria a essas
-- imobiliárias — quando ela é, por ora, só para demonstração. Sem a linha
-- `cobranca`, a ficha do contrato fica sem Cobranças, sem destino do repasse e
-- sem a lista "Falta para cobrar e repassar"; Configurações fica sem a conta do
-- Asaas; e a Área do Cliente não mostra boletos.
--
-- ⚠️ Escrita por extenso, pelo mesmo motivo da 0045: recriar a constraint sem
-- um dos valores existentes DESLIGA aquele recurso de toda imobiliária que paga.
--
-- Idempotente: seguro rodar de novo.

alter table public.tenant_features drop constraint if exists tenant_features_feature_check;
alter table public.tenant_features
  add constraint tenant_features_feature_check check (feature in ('portal', 'about', 'ai', 'crm', 'cobranca'));
