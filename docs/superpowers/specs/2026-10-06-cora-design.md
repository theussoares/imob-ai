# Cobrança pela Cora (Integração Direta) e adaptadores de provedor

**Data:** 2026-10-06
**Motivo:** a OLMI, primeira imobiliária de verdade, abriu conta na Cora e não
no Asaas. Hoje a cobrança só emite pelo Asaas (0051) e pelo simulado. Outros
bancos devem vir depois, então o trabalho tem dois eixos: o adaptador da Cora e
tirar o `asaas | simulado` que estava colado em tabela, endpoint e tela.

Não temos parceria com a Cora (pedida em 26/09, sem retorno). A **Integração
Direta** não exige parceria: cada imobiliária gera `client_id`, certificado e
chave privada na Cora e nós falamos com a API por mTLS.

## Escopo

- Adaptador `server/services/payments/cora.ts` atrás de `PaymentProvider`
  (emitir, cancelar, consultar, webhook, simular em stage).
- Transporte mTLS isolado por conta (`cora-transporte.ts`): agente e token em
  cache por `tenantId + hash das credenciais`.
- Credenciais no cofre: `client_id` legível, certificado + chave cifrados;
  validade lida do X.509 e mostrada no painel.
- Webhook único `/api/webhooks/<provedor>/<webhookId>`; a URL do Asaas não muda.
- Migration 0058 (CHECKs de provedor por extenso, colunas de credencial e de
  status, `processed_at` no diário).
- `exigirCobranca` nos endpoints que ainda deixavam passar dinheiro com a flag
  desligada.
- LGPD no mesmo PR: política, runbook e guardrail.

**Fora do escopo, por decisão:**

- **Parceria/OAuth (authorization_code).** Aguarda a Cora. A interface não muda:
  entra como outro transporte de autenticação.
- **Repasse automático e Transferências da Cora.** O repasse continua manual.
- **Carnê parcelado, régua de cobrança, geração mensal por cron.** Não pedidos.
- **Mais de uma conta de cobrança por tenant.** A PK de
  `tenant_payment_accounts` continua `tenant_id`; o cache já é por conta, então
  a mudança futura não toca o transporte.

## O que a Cora não tem, e como o adaptador cobre

| Falta na Cora | Cobertura |
|---|---|
| Cadastro de cliente | `criarCliente` é no-op; nome, documento e e-mail vão inline em `emitir` (`CobrancaParaEmitir.pagador`) |
| "Recebido em dinheiro" | `baixarPorFora` **cancela** o boleto lá; a liquidação é de `baixarManualmente`, com autor e data. Se a Cora responde `REC-0006` (já pago), sincroniza em vez de liquidar em dobro |
| Assinatura de webhook | A autoria vem do `webhook_id` secreto da URL; o fato vem da **reconsulta** `GET /v2/invoices/{id}`. O corpo do webhook (vazio) não é lido |
| Estorno por status | Estorno acontece no app da Cora; a mensagem da tela diz isso |

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Integração Direta agora, Parceria depois | Esperar a parceria | A OLMI precisa cobrar; a Direta funciona hoje e só muda a autenticação |
| `node:https` com `Agent({cert,key})` | `undici.Agent` + `fetch` | O projeto não depende de `undici`; importar de fora com versão diferente da embutida no Node falha em silêncio |
| Cache de agente e token por `tenantId + hash das credenciais` | Agente novo por requisição; cache global | Por requisição refaz o handshake mTLS a cada boleto; global mistura o certificado de um tenant com o de outro. O hash troca a chave quando a credencial muda, e o agente velho é fechado |
| Um refresh de token em voo (promise compartilhada), com margem de 5 min | Renovar só no 401 | Dez requisições com token vencido fariam dez pedidos de token |
| `Idempotency-Key` determinística (`charge:<id>:v1`) | UUID aleatório por tentativa | O retry de uma emissão derrubada pela rede geraria outro boleto. A trava local `issued_at` continua sendo a primeira camada |
| Reconsultar a fatura ao receber webhook | Confiar nos cabeçalhos | Sem assinatura, qualquer POST na URL serviria de "pagou" |
| `client_id` em coluna + par cifrado em `credentials_ciphertext` | Tudo num JSON cifrado; ou PEM em claro | O client_id só identifica; o par dá poder de emitir. Dump do banco sem a chave-mestra não pode emitir boleto |
| Validar o par certificado + chave no upload | Deixar a Cora recusar | O erro de handshake não diz qual arquivo está errado |
| Baixa manual = cancelar na Cora + liquidar aqui | Novo status "paga manualmente" | Estado é derivado (0041); `charge_settlements` já grava `method`, `created_by`, `settled_on`. Status gravado divergiria da soma das linhas |
| LGPD no mesmo PR | PR separado | Regra do CLAUDE.md: PR separado abre janela com a política falsa |

## Pendências (conferidas na doc da Cora em 06/10; o que resta só se prova em stage)

1. ~~Hosts~~ **Resolvido.** A doc de "Instruções iniciais" lista, para a Integração
   Direta, `matls-clients.api.stage.cora.com.br` e `matls-clients.api.cora.com.br`
   (stage e produção usam certificados diferentes). Bate com `BASE_CORA`.
2. **Endereço do pagador: opcional na doc.** O `customer.address` não é
   obrigatório, mas, se enviado, todos os subcampos são (rua, número, bairro,
   cidade, UF, complemento, CEP). Por isso enviamos **sem** endereço, nunca
   parcial, e nunca um endereço inventado. Se a Cora recusar na prática, a saída
   é guardar o endereço do inquilino no cadastro, não preencher um padrão.
3. **`interest.rate`: base não documentada** (só "0 a 100, duas casas"). Assumimos
   ao mês, como no Asaas. Provar em stage: R$ 100,00, multa 2%, juros 1%, e
   conferir o boleto pago com atraso.
4. **Simular em stage:** a Cora não deixa pagar o boleto emitido pela própria
   conta (`REC-0007`). O teste pede duas contas de teste: uma emite, a outra paga.
5. Status `credencial_invalida` existe na coluna, mas nada o grava ainda.
6. Sem verificação periódica da validade do certificado (só o aviso na tela).

**Bloqueia a OLMI:** o smoke test em stage (token → emitir → consultar → webhook →
pagar por outra conta → baixa e repasse). Só depois disso pedir as credenciais de
produção. Roteiro em `docs/runbooks/cobranca-testes-manuais.md`, seção 10.
