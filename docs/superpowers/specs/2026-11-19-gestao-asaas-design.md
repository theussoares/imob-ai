# Gestão × Asaas — preparação da integração

Data: 2026-11-19 · Status: **preparação (nada emitido ainda)**

## Motivo

A Olmi usa o `/gestao` em produção. Hoje as cobranças de locação são
**registros**: a recepção gera a cobrança do mês, registra o pagamento (com ou
sem comprovante) e o repasse ao locador. Nada sai para o banco. A decisão do
cliente (19/11): por ora continua só registro, mas a integração com o Asaas
precisa estar desenhada para entrar sem refazer o que existe.

## O que já existe e será reaproveitado

- **Porta `PaymentProvider`** (`server/services/payments/provider.ts`), com o
  adaptador Asaas e o simulado. Status do Asaas nunca sai do adaptador.
- **Conta por imobiliária**: `tenant_payment_accounts` (0051), só service_role,
  chave guardada cifrada, webhook com `webhook_id` público + segredo provado
  por cabeçalho (`/api/webhooks/asaas/[hookId]`).
- **Domínio de cobrança da gestão** (`layers/gestao/domain/cobranca.ts`,
  `acoes-locacao.ts`): `registrarPagamento`, `registrarRepasse`,
  `anexarComprovante`; multa e juros pro rata calculados por nós.
- A política de privacidade já lista o Asaas como operador de pagamento.

## Escopo desta preparação

1. Esta spec e as decisões abaixo.
2. Nenhuma emissão real, nenhuma chamada ao Asaas a partir do `/gestao`.
3. O desenho do mapeamento webhook → `registrarPagamento`, para que o dia da
   ligação seja só fiação.

## Fora do escopo, por decisão

- Emitir boleto/Pix a partir do `/gestao` (cliente: "por hora só registros").
- Split/repasse automático via conta digital.
- Cobrança em lote (cliente ainda não decidiu).
- Migrar as cobranças do jsonb para `contract_charges`.

## Desenho (para quando for ligar)

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Cobrança da gestão continua no jsonb `dados`; o vínculo com o Asaas entra como campo opcional `externo { provedor, externalId, paymentUrl, pixCopyPaste, linhaDigitavel }` na `Cobranca` | Reescrever para `contract_charges` (0041) | A gestão é um módulo próprio, com tela, histórico e auditoria prontos; duas fontes de verdade para o mesmo boleto seriam pior que um campo opcional. `contract_charges` segue valendo para o portal do cliente |
| Webhook "pago" vira `registrarPagamento` com `forma` `boleto`/`pix` e `comprovante` = id do pagamento no Asaas | Gravar direto no jsonb | Passa pelas mesmas regras (saldo, parcial, encargos, histórico); um só caminho de baixa |
| Idempotência por `payment_webhook_events` (`eventId` único, já existe) | Deduplicar pelo valor/data | O Asaas reenvia; valor e data repetem em pagamentos legítimos |
| Valor cobrado no Asaas = valor atualizado (aluguel + multa + juros) no dia da emissão; multa/juros do Asaas ficam **zerados** | Deixar o Asaas calcular encargos | Nosso cálculo é o que a tela mostra (fuso Campo Grande); dois cálculos divergem por centavos |
| Conta Asaas é por imobiliária (`tenant_payment_accounts`), chave em `serviceSupabase` apenas | Chave da plataforma única | O dinheiro é do cliente; chave compartilhada mistura saldos |
| Baixa feita à mão no painel quando há `externo` chama `baixarPorFora` | Deixar o boleto pagável | Evita pagamento em duplicidade (o provedor já faz isso para o portal) |
| Ligação atrás de flag por tenant (`tenant_payment_accounts` existir e estar ativa) | Flag global | A Olmi liga quando quiser; Aurora (demo) continua simulada |

## Riscos e pré-requisitos

- **LGPD**: dados do pagador (nome, CPF/CNPJ, e-mail, telefone) vão ao Asaas.
  Já coberto na política; reconferir a seção ao ligar.
- Conta Asaas da Olmi aberta e verificada; webhook cadastrado (já há rota).
- Testar primeiro no **sandbox** do Asaas (o adaptador já tem ambiente).
- Cada evento do webhook entra pelo tenant provado pela URL + segredo, nunca
  pelo corpo (invariante nº 1).

## Passos para ligar (quando o cliente decidir)

1. Cliente cadastra a conta Asaas (tela de conta já existente).
2. Campo `externo` na `Cobranca` + schema no mapper; botão "Emitir cobrança".
3. Handler do webhook com ramo para cobranças da gestão (busca por `externalId`
   no jsonb do tenant provado).
4. Teste ponta a ponta no sandbox; só então produção.
