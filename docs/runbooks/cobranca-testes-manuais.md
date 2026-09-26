# Cobrança pelo Asaas — testes manuais

O `pnpm test` cobre as regras com o provedor falso: ordem do cancelamento,
idempotência, repasse, recorte do inquilino, conexão da conta. O que ele NÃO
alcança é o Asaas de verdade: se a chamada que montamos é a que o Asaas aceita,
se o webhook chega ao nosso domínio, se o boleto impresso bate com o painel.
Este roteiro é para isso. Rode inteiro antes de ligar a cobrança para um cliente
e depois de mexer em `server/services/payments/asaas.ts`.

Cada item diz o que fazer, o que tem de acontecer e onde conferir. "No Asaas" é
o painel do sandbox (`sandbox.asaas.com`).

## 0. Antes de começar

- [ ] Conta no **sandbox** do Asaas e chave de API dela (começa com `$aact_hmlg_`).
- [ ] `NUXT_PAYMENTS_ENCRYPTION_KEY` (32+ caracteres) definida no ambiente do
      deploy, com redeploy depois. Sem ela, conectar responde 503.
- [ ] **O deploy precisa ser alcançável pelo Asaas.** Preview da Vercel com
      Deployment Protection devolve 401 ao webhook, e nada baixa sozinho. Use um
      domínio sem proteção ou o bypass de automação da Vercel. `localhost` não serve.
- [ ] Tenant de teste com a Área do Cliente ativa e dois usuários no painel:
      um **owner** e um **admin**.
- [ ] Contrato ativo com:
  - inquilino com CPF válido e e-mail;
  - proprietário vinculado;
  - aluguel, multa, juros e taxa de administração preenchidos (ex.: 10%);
  - destino de repasse do proprietário informado.

## 1. Conectar a conta (Configurações → Cobrança)

| # | Faça | Tem de acontecer |
|---|---|---|
| 1.1 | Entre como **admin** e tente conectar | Recusa: só o responsável conecta |
| 1.2 | Como owner, cole uma chave inválida | Mensagem do Asaas em português; nada salvo |
| 1.3 | Cole a chave de sandbox escolhendo "Produção" | "Esta é uma chave de SANDBOX…" |
| 1.4 | Conecte com a chave certa em Sandbox | Painel mostra o nome da conta do Asaas e só os 4 últimos caracteres da chave |
| 1.5 | No Asaas → Integrações → Webhooks | Um webhook com URL `https://<seu-domínio>/api/webhooks/asaas/<uuid>`, ativo, fila sequencial, com os eventos de pagamento |
| 1.6 | Reconecte (mesma chave) | No Asaas o webhook antigo some e fica só o novo, com outro uuid |
| 1.7 | DevTools → Network na tela de Cobrança | Nenhuma resposta traz a chave, o hash ou o id do webhook |

## 2. Gerar e emitir (ficha do contrato → Cobranças)

| # | Faça | Tem de acontecer |
|---|---|---|
| 2.1 | Gere o rascunho do mês com condomínio e um desconto | Total = aluguel + condomínio − desconto; competência e vencimento aparecem separados (setembro vence em outubro) |
| 2.2 | Gere outro "mensal" do mesmo mês | Recusa: já existe cobrança mensal deste mês |
| 2.3 | Emita | No Asaas, cobrança tipo boleto com o valor, o vencimento, a multa e os juros do contrato, no cliente com o CPF do inquilino |
| 2.4 | Abra o boleto (link do painel) | O PDF traz a mesma linha digitável do painel e o QR Pix; o valor bate com o total |
| 2.5 | No Asaas, abra o cadastro do cliente | Notificações desligadas: o Asaas não manda e-mail nem SMS ao inquilino (seriam cobrados da imobiliária) |
| 2.6 | Duplo clique rápido em "Emitir", ou emita em duas abas | Só **um** boleto no Asaas; a segunda tentativa é recusada |
| 2.7 | Tente emitir com o inquilino sem CPF | Recusa antes de chamar o Asaas, dizendo o que falta |

## 3. Pagamento pelo webhook

| # | Faça | Tem de acontecer |
|---|---|---|
| 3.1 | Na cobrança emitida, clique em "Simular pagamento" | Aviso de que está aguardando o Asaas; em até ~10 s a cobrança vira **paga** sem recarregar a página |
| 3.2 | No Asaas → Webhooks → histórico de envios | Os eventos do pagamento com resposta **200**. Um 401 aqui é a proteção do deploy (item 0) |
| 3.3 | Veja o repasse criado | Pendente, com bruto = valor pago e taxa **só sobre o aluguel** (nada sobre o condomínio); data prevista em dias úteis, pulando feriado nacional |
| 3.4 | No Asaas, reenvie o mesmo evento | Nada muda: uma liquidação só e um repasse só |
| 3.5 | Marque o repasse como pago e tente marcar de novo | Primeira vez ok; segunda, "já marcado" |

## 4. Baixa manual (recebido por fora)

| # | Faça | Tem de acontecer |
|---|---|---|
| 4.1 | Em boleto emitido, registre um valor **menor** que o saldo | Recusa, dizendo o saldo e mandando cancelar e emitir outro |
| 4.2 | Registre o valor cheio, em dinheiro | Cobrança paga; no Asaas o boleto aparece como "Recebido em dinheiro" |
| 4.3 | Espere o webhook desse recebimento chegar (histórico do Asaas) | Continua **uma** liquidação só; o eco não duplica nem gera segundo repasse |
| 4.4 | Registre com data futura | Recusa |
| 4.5 | Num rascunho (não emitido), registre um pagamento parcial | Aceita; nada vai ao Asaas; a cobrança fica parcial com o total congelado |

## 5. Cancelamento

| # | Faça | Tem de acontecer |
|---|---|---|
| 5.1 | Cancele uma cobrança emitida | No Asaas a cobrança é removida; aqui fica cancelada com o motivo |
| 5.2 | Exclua uma cobrança direto no painel do Asaas | Via webhook, ela fica cancelada aqui, com o motivo "Removida no painel do provedor" |
| 5.3 | Tente cancelar uma cobrança paga | Recusa, mandando registrar estorno |
| 5.4 | Desconecte a conta e tente cancelar uma cobrança emitida por ela | Recusa: o boleto é de outra conta, cancele no Asaas |

## 6. Estorno

| # | Faça | Tem de acontecer |
|---|---|---|
| 6.1 | No Asaas, estorne um pagamento recebido (se o sandbox permitir para o meio usado) | Aqui a cobrança volta para em aberto ou vencida, com uma linha negativa por liquidação |
| 6.2 | Estorne uma cobrança cujo repasse ainda está **pendente** | O repasse vira **Cancelado**, e o botão "Marcar como feito" some dele |
| 6.3 | Estorne uma cobrança cujo repasse já foi **marcado como feito** | O repasse fica "**Feito · estornado**", e a seção de repasses mostra em vermelho quanto foi transferido a mais, pedindo a devolução ou o desconto no próximo repasse |
| 6.4 | Depois do 6.3, registre um novo pagamento dessa cobrança por baixa manual. Não dá para emitir outro boleto: a cobrança segue ligada ao estornado. Se o Asaas recusar a baixa de um pagamento estornado, anote a mensagem: o cenário fica coberto só pelo teste automático (`aMaiorSeMarcarFeito`) | Nasce um repasse pendente novo, com o aviso "Já repassado antes do estorno: não transfira de novo". Ao clicar em "Marcar como feito", o diálogo é vermelho ("O proprietário já recebeu por <mês>") e mostra o valor que sairia a mais |
| 6.5 | No Asaas, reenvie o evento de estorno (histórico do webhook, se o painel permitir) | Nada muda: nenhuma linha negativa nova, e o repasse continua como estava |

## 7. Área do Cliente (portal)

| # | Faça | Tem de acontecer |
|---|---|---|
| 7.1 | Entre como o **inquilino** e abra o contrato | Vê as cobranças emitidas com vencimento, valor, link do boleto, linha digitável e Pix; **não** vê rascunho, itens, taxa ou liquidações |
| 7.2 | Depois de paga ou cancelada | A cobrança continua listada, mas **sem** link, linha ou Pix |
| 7.3 | Entre como **proprietário** ou fiador do mesmo contrato | Lista de cobranças vazia |
| 7.4 | Na página de privacidade | O Asaas aparece em "Com quem compartilhamos" |

## 8. Segurança do webhook (curl contra o deploy)

```bash
URL=https://<seu-domínio>/api/webhooks/asaas/<uuid-do-item-1.5>
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" -H 'asaas-access-token: errado' -H 'content-type: application/json' -d '{"id":"evt_x","event":"PAYMENT_RECEIVED","payment":{"id":"pay_x","value":1}}'
# 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<seu-domínio>/api/webhooks/asaas/00000000-0000-4000-8000-000000000000 -d '{}'
# 404
```

- [ ] Depois do 1.6, um POST na URL **antiga** dá 404.

## 9. Antes de ligar em produção para um cliente

- [ ] `NUXT_PAYMENTS_ENCRYPTION_KEY` na Vercel de **produção**. Trocar essa
      chave depois invalida as chaves de API já gravadas: cada conta precisa
      ser reconectada.
- [ ] O cliente conecta com a chave de produção (`$aact_prod_`) escolhendo "Produção".
- [ ] Emita um boleto de R$ 5,00 para um CPF da equipe, pague por Pix de
      verdade e confira a baixa automática e o repasse.
- [ ] Estorne esse pagamento pelo Asaas e confira os itens 6.1 e 6.2.
- [ ] "Simular pagamento" **não** aparece para cobrança de produção.
