# Módulos financeiros e de operação (locação)

**Data:** 2026-09-01
**Motivo:** o cliente entra na plataforma pelo catálogo, mas quando cresce —
principalmente quando passa a administrar locação — ele precisa de nota fiscal,
cobrança de aluguel, repasse ao proprietário e emissão de documentos. Hoje isso
não existe aqui, e é exatamente onde Kenlo, Vista e Superlógica seguram a
imobiliária estabelecida. Sem um caminho para essas features, o cliente que a
gente fisgou pequeno migra quando amadurece. Este documento não é ordem de
construir agora: é a orquestração de COMO construir quando cada gatilho chegar,
para não improvisar sob pressão de um cliente específico.

## Princípio que decide tudo: integrar, não reconstruir

Nada aqui é "construir um banco" ou "construir um motor fiscal". Quem faz isso
afoga em compliance e nunca entrega. O padrão é sempre o mesmo: **a plataforma
orquestra; um provedor assume o dinheiro, o imposto e a regulação.** A Moradi
decide *quando* emitir, *quanto*, *para quem* — e chama a API. Isso muda o custo
de "proibitivo" para "add-on por-uso, repassável ao cliente", e tira de cima da
gente a responsabilidade que a gente não quer ter (mover dinheiro de terceiro,
apurar imposto municipal de 5.570 prefeituras).

Consequência de arquitetura: cada módulo é um **adaptador** atrás de uma
interface nossa. O código do painel nunca fala com Asaas/eNotas direto; fala com
`server/services/payments`, `server/services/fiscal`, `server/services/esign` —
e o provedor é detalhe trocável. No dia que um provedor ficar caro ou cair, troca
o adaptador, não o produto.

## Escopo (quatro módulos, nesta ordem)

A ordem é por **retenção ÷ esforço**: começa barato e de baixo risco, sobe para o
que trava o cliente de vez (e é o mais arriscado, porque mexe com dinheiro).

1. **Emissão de documentos** — contrato, recibo, autorização de venda, em PDF.
2. **Assinatura digital** — assinar esses documentos sem papel.
3. **Cobrança e pagamento de aluguel** — boleto/PIX + repasse ao proprietário.
4. **Nota fiscal (NFS-e)** — emitir a nota do serviço/comissão.

Cada um abaixo tem: abordagem, provedor candidato, passos, dado que nasce, custo,
esforço, gatilho (o sinal do cliente que justifica construir) e o que fica de
fora.

---

### 1. Emissão de documentos (PDF)

**Objetivo:** gerar contrato de locação/venda, recibo e autorização a partir de
um template com os dados que já temos (imóvel, proprietário, corretor, valores).

**Abordagem:** template → PDF no servidor. Sem provedor externo, sem custo por
documento. É o módulo mais barato e o que destrava a assinatura (item 2).

**Passos:**
- Modelo de dados: `document_templates` (tenant_id, tipo, corpo com variáveis) e
  `generated_documents` (tenant_id, template_id, lead_id/property_id, url do PDF,
  criado_por, criado_em).
- Templates iniciais versionados no código (contrato de locação, recibo,
  autorização de venda), editáveis por tenant depois.
- Serviço `renderDocument(templateId, context)` → HTML → PDF. Reaproveitar o que
  já existe de PDF no ambiente (Playwright/Chromium já vem pré-instalado).
- Tela `/admin/documentos`: escolher tipo, preencher/confirmar variáveis, gerar,
  baixar. Guardar no Storage do tenant (bucket já isolado por tenant, ver 0012).

**Dado que nasce:** o histórico de documentos emitidos por cliente — mais uma
âncora de retenção.

**Custo:** ~R$0. **Esforço:** baixo. **Gatilho:** o primeiro cliente que pedir
"onde faço o contrato". **Trava o cliente?** médio.

**Fora do escopo:** editor visual de template rico. Começa com campos fixos por
tipo; o WYSIWYG entra se alguém pedir.

---

### 2. Assinatura digital

**Objetivo:** assinar os documentos do item 1 com validade jurídica, sem papel.

**Abordagem:** integrar um provedor de assinatura. **Candidato: ZapSign** (BR,
API REST simples, preço por documento baixo); Autentique e Clicksign como
alternativas. O adaptador `server/services/esign` esconde qual é.

**Passos:**
- Credencial do provedor **por tenant** (o cliente assina pela conta dele, ver
  invariantes): tabela `tenant_integrations` (provider, chaves cifradas, escopo).
- `sendForSignature(documentId, signers[])` → cria o envelope, devolve o link.
- Webhook de status (`pendente → assinado`) atualizado em `generated_documents`.
- Na tela de documentos: botão "Enviar para assinatura", status do envelope, PDF
  assinado quando volta.

**Custo:** ~R$1–5 por assinatura (repassável). **Esforço:** baixo-médio (a parte
chata é o webhook idempotente). **Gatilho:** junto com o item 1, assim que um
cliente fechar contrato pela plataforma. **Trava o cliente?** alto.

**Fora do escopo:** certificado ICP-Brasil/e-CPF próprio. A assinatura eletrônica
do provedor cobre locação e a maioria dos casos; ICP só se um cliente exigir.

---

### 3. Cobrança e pagamento de aluguel (com repasse)

O módulo mais valioso — e o mais arriscado. Quando o aluguel do cliente é cobrado
e repassado pela plataforma, ele **não sai mais**. Também é onde um bug custa
dinheiro real, então tem as invariantes mais duras (seção própria abaixo).

**Objetivo:** gerar a cobrança mensal do inquilino (boleto/PIX), conciliar o
pagamento, calcular multa/juros de atraso e **repassar ao proprietário** o valor
menos a comissão.

**Abordagem:** gateway com split e conta de pagamento. **Candidato: Asaas** (forte
em imobiliária: boleto, PIX, split/repasse nativo, webhooks); Iugu como
alternativa. **A Moradi nunca custodia o dinheiro** — o provedor é o custodiante;
a gente orquestra e reconcilia.

**Passos:**
- `contracts` (locação): proprietário, inquilino, imóvel, valor, dia de
  vencimento, índice de reajuste (IGPM/IPCA), início/fim.
- `charges` (cobranças): contract_id, competência (mês), vencimento, valor,
  status (pendente/pago/atrasado/cancelado), id da cobrança no provedor, url do
  boleto/PIX, pago_em. **Valores em centavos (inteiro), nunca float.**
- `payouts` (repasses): charge_id, destinatário (proprietário), valor, taxa,
  status, liquidado_em.
- Job mensal: gera as cobranças da competência a partir dos contratos ativos.
- Webhook do provedor: marca pago, dispara o repasse (só após compensar).
- Multa/juros: por contrato (padrão multa 2% + juros 1% a.m. pró-rata), calculado
  na virada para atrasado.
- Telas: contratos, cobranças (com filtro de atrasadas), repasses.

**Custo:** ~R$1,50–3,50 por boleto, PIX ~1% (repassável). **Esforço:** médio-alto
(conciliação, repasse, atraso, estados). **Gatilho:** o primeiro cliente de
locação pesada pedindo cobrança. **Trava o cliente?** altíssimo.

**Fora do escopo:** virar instituição de pagamento (custódia própria — exige
autorização do Banco Central); antifraude/cartão próprio; cobrança de condomínio.

---

### 4. Nota fiscal (NFS-e)

**Objetivo:** emitir a nota fiscal de serviço da imobiliária (comissão de venda,
taxa de administração de locação).

**Abordagem:** API fiscal que abstrai a prefeitura. **Candidato: Nuvem Fiscal**
(API moderna, preço por nota baixo) ou eNotas/PlugNotas/Focus. A complexidade de
"cada município tem seu sistema" é do provedor, não nossa.

**Passos:**
- Dados fiscais do tenant (CNPJ, inscrição municipal, código de serviço, alíquota
  ISS) em `tenant_integrations`/config fiscal.
- `issueInvoice(context)` → cria a NFS-e via provedor, guarda id/url/xml.
- `invoices`: origem (charge_id ou venda), provider_ref, status, url do PDF/XML.
- Emissão manual primeiro (botão "Emitir nota"); automática (ao compensar o
  aluguel) depois, encaixando no item 3.

**Custo:** ~R$0,10–0,50 por nota ou plano ~R$50–150/mês (repassável). **Esforço:**
baixo-médio (é integração). **Gatilho:** junto do financeiro, quando o cliente já
cobra pela plataforma. **Trava o cliente?** alto.

**Fora do escopo:** apuração contábil completa, DAS/Simples, NF-e de produto.
Isso é ERP contábil; a gente emite a nota do serviço e para aí.

---

## Invariantes (dinheiro e imposto não perdoam)

Cada uma vira teste antes de qualquer módulo 3/4 ir para produção.

1. **Credencial de provedor é secret, cifrada, e só o servidor lê.** Chave de
   gateway/fiscal nunca vai para o cliente (bundle público) nem para o painel.
   Fica em `tenant_integrations`, cifrada, acessível só via service role no
   servidor — mesmo raciocínio da coluna privada de `properties`.
2. **A Moradi não custodia dinheiro.** O provedor é o custodiante. A gente
   orquestra e concilia. Custodiar exige ser instituição de pagamento — não é o
   negócio.
3. **A fonte da verdade do pagamento é o provedor, via webhook — nunca a tela.**
   Marcar "pago" na mão sem confirmação do gateway é como o inquilino não tivesse
   pago: some no fechamento.
4. **Webhook idempotente.** Provedor reentrega evento. Processar duas vezes não
   pode gerar repasse dobrado. Chave de idempotência por evento.
5. **Valor em centavos (inteiro).** Float em dinheiro acumula erro de arredonda-
   mento; num repasse isso é reclamação do proprietário.
6. **Repasse só depois de compensar.** Nunca repassar sobre cobrança ainda não
   liquidada — seria pagar o proprietário com dinheiro que não entrou.
7. **Tenant vem sempre de `requireTenantMember`, nunca do body.** Igual ao convite
   de usuários: quem controla o tenant enviado fatura/cobra em nome de outro
   cliente.
8. **Tudo que mexe em dinheiro tem `updated_by` e trilha.** "Quem cancelou essa
   cobrança?" precisa de resposta. Encaixa na pendência de auditoria já aberta.

## Passos manuais por cliente (não dá para automatizar tudo)

- **Conta no provedor.** Cada cliente precisa da própria conta (Asaas/ZapSign/
  fiscal) e conectá-la pelo painel — igual ao fluxo do Trello. A key é do cliente,
  o dinheiro/imposto é do cliente. A Moradi orquestra, não intermedeia a conta.
- **Dados fiscais** (CNPJ, inscrição municipal, código de serviço, ISS) para a
  NFS-e — sem isso a nota é rejeitada pela prefeitura.

## Monetização (por que isso é receita, não custo)

Cada módulo é um **plano ou add-on** com margem sobre o custo do provedor: um
"módulo locação" mensal, ou uma pequena taxa sobre o repasse. A evolução da
plataforma e o faturamento passam a crescer no mesmo trilho — e o cliente que sobe
de plano é o que menos sai.

## Fora do escopo do conjunto, por decisão

- **Ser instituição de pagamento / custodiar dinheiro.** Regulatório do Banco
  Central. O provedor custodia.
- **Reconstruir motor fiscal municipal.** É o que a API fiscal existe para evitar.
- **Contabilidade completa / conciliação bancária geral.** Isso é ERP contábil;
  não é o nosso jogo.
- **Fazer os quatro de uma vez.** Cada um entra no seu gatilho. Construir
  financeiro sem um cliente de locação real é adivinhar requisito.

## Sequência recomendada e dependências

```
1. Documentos (PDF)        ─┐
2. Assinatura digital      ─┘ dependem um do outro; entregar juntos
3. Cobrança de aluguel + repasse   (independente; maior esforço e risco)
4. Nota fiscal             ← encaixa em cima do item 3
```

Próximo passo real continua sendo fechar o ciclo do funil (notificação de lead +
lembrete de retorno). Os módulos deste documento entram na fase de operação/
locação — cada um quando o gatilho do cliente aparecer, e sempre integrando.

## Quando for construir um destes

Este é o **design** (o quê e por quê). O **plano** de implementação de cada
módulo — passo a passo de arquivos, migrações e testes — vira um documento
próprio em `docs/superpowers/plans/` no dia que o gatilho chegar, começando pelo
módulo escolhido e não pelos quatro juntos.
