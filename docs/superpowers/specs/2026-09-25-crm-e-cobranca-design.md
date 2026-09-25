# CRM de atendimento e cobrança por boleto — plano de produto

**Data:** 2026-09-25
**Motivo:** duas apresentações para imobiliárias em 28/09. As duas frentes que
decidem a venda são as que hoje o produto não tem: um CRM que o corretor usa no
dia a dia (não só um quadro de etapas) e a cobrança do aluguel por boleto/Pix
sem a imobiliária subir PDF um por um. O catálogo público já vende; o que segura
a imobiliária depois do primeiro mês é a operação.

Este documento faz o papel de PMO: estudo de mercado, regra de negócio, o que
entra na demo e o que fica para o "nos dê uns dias para finalizar". Ele é a
referência de escopo — o que não estiver aqui não entra até 28/09.

---

## 1. O que o mercado entrega (e onde a gente entra)

| Quem | Força | O que isso nos diz |
|---|---|---|
| **Kenlo Locação** | ~3 mil administradoras, boleto integrado a 34+ bancos, NFS-e em 1.800 prefeituras, app com boleto e extrato | "Integra com o seu banco" é argumento de venda esperado, não diferencial |
| **Superlógica Imobiliárias** | Split de pagamento, conta corrente por proprietário, repasse automático | Repasse automático é o que trava o cliente de vez |
| **Jetimob / Imobzi / Apto** | Funil customizável, **roleta de leads** com redistribuição por SLA, agenda de visitas, histórico | CRM sem distribuição e sem agenda é planilha com cor |

Fontes: [Kenlo Locação](https://plataforma.kenlo.com.br/administracao-de-imoveis/),
[Superlógica](https://superlogica.com/recursos/funcionalidades-imobiliarias/),
[Jetimob — distribuição de leads](https://www.jetimob.com/recursos/distribuicao-leads),
[comparativo CRMs de locação 2026](https://melhorescrm.com/melhores/crm-para-imobiliaria-de-locacao/).

**Onde a Moradi ganha:** o site já é do cliente, com o tema dele, e o lead
já nasce dentro do sistema com a página de origem, o clique no WhatsApp e a
política de privacidade conformes. Os concorrentes vendem site e ERP como produtos
separados que se falam por integração. O discurso da demo é **um lugar só:
do anúncio ao boleto pago.**

---

## 2. O que já existe (ponto de partida real)

- `leads` com `stage`, `notes` (um texto livre só), `next_contact_at`,
  `broker_id`, quadro de funil em `/admin/leads`, aviso de lead por e-mail,
  clique no WhatsApp com conversão.
- `brokers` é **cadastro, não usuário** — não loga (ver CLAUDE.md, "Papéis").
- `contracts`, `contract_parties`, `portal_users`, Área do Cliente com
  documentos em PDF.
- Tabelas financeiras **vazias e sem lógica** (0041/0042):
  `payout_destinations`, `contract_charges`, `charge_items`,
  `charge_settlements`, `owner_payouts`. Ver
  `2026-09-21-modelo-financeiro-design.md` — esta spec **constrói em cima dela,
  sem mudar nenhuma decisão de lá**.

---

## 3. Frente A — CRM

### A1. Histórico do lead (linha do tempo)

Hoje o atendimento inteiro cabe em `notes`, um campo que o corretor sobrescreve.
Não se sabe quando ligou, quantas vezes, nem quem mudou a etapa.

**Tabela `lead_events`** (append-only, como o financeiro):

```
id, tenant_id, lead_id
kind         nota | ligacao | whatsapp | email | visita | etapa | atribuicao | tarefa | criado
body         text          -- o que o corretor escreveu
meta         jsonb         -- { from: 'novo', to: 'contato' } em 'etapa'; { broker_id } em 'atribuicao'
occurred_at  timestamptz   -- quando aconteceu (ligação de ontem registrada hoje)
created_at, created_by
```

Regras de negócio:

1. **Evento de sistema é gravado pelo servidor, no mesmo endpoint** que muda o
   estado (etapa, corretor, tarefa concluída) — nunca pelo navegador. Registro
   que o cliente pode esquecer de mandar não é histórico.
2. **Não se edita nem apaga evento.** Anotação errada se corrige com outra.
   Mesmo motivo do financeiro: o histórico vale como prova ("liguei três vezes").
3. **Todo evento atualiza `leads.updated_at`.** Sem isso o expurgo de 24 meses
   (`purgeStaleLeads`, LGPD) apagaria um lead em atendimento ativo cujo único
   movimento foi anotação. Teste obrigatório.
4. `notes` antigo não é migrado para evento: aparece como "Anotação anterior"
   no topo da linha do tempo, somente leitura, e o campo deixa de ser editável.
5. O clique no WhatsApp que gerou o lead (já existe) aparece na linha do tempo.
6. Mover para **perdido exige motivo** (`lost_reason`: preco, ja_fechou,
   sem_resposta, credito_negado, desistiu, outro). É o relatório que o dono da
   imobiliária pede na segunda reunião.

### A2. Agenda e tarefas

`next_contact_at` é uma data só por lead. Visita tem imóvel, hora e corretor;
retorno tem outro dono. Uma data não comporta.

**Tabela `lead_tasks`**:

```
id, tenant_id, lead_id (null = tarefa avulsa), property_id (visita), broker_id
kind      visita | retorno | outro
title, due_at, done_at, done_by, canceled_at
created_at, created_by
```

Regras:

1. **`next_contact_at` passa a ser derivado:** o menor `due_at` de tarefa
   aberta do lead, recalculado pelo servidor a cada mudança. Continua existindo
   porque o expurgo LGPD e o alerta de follow-up já leem dele — trocar a fonte
   sem trocar os leitores seria regressão silenciosa.
2. Concluir tarefa grava evento (`tarefa`, com o título) na linha do tempo.
3. Visita concluída sugere mover o lead para a etapa **Visita** (sugere, não
   move: quem decide o funil é o corretor).
4. **Tela `/admin/agenda`:** Atrasadas · Hoje · Próximos 7 dias, filtro por
   corretor. É a tela que o corretor abre de manhã.

### A3. Distribuição para corretores (roleta)

Regras:

1. `tenants.lead_distribution`: `manual` (padrão, como hoje) ou `roleta`.
2. `brokers.receives_leads` (boolean) escolhe quem entra na roleta.
3. Roleta = **quem recebeu há mais tempo recebe o próximo**
   (`brokers.last_lead_at`). A escolha e a marcação são **um único `update`
   atômico** numa função SQL com `for update skip locked` — dois leads ao mesmo
   tempo não caem no mesmo corretor nem pulam ninguém.
4. Lead que chega com corretor definido (clique no WhatsApp de um corretor
   específico) **não passa pela roleta**: o visitante escolheu com quem falar.
5. Atribuição grava evento `atribuicao` e avisa o corretor por e-mail (o aviso
   de lead já existe; muda o destinatário).
6. **Carteira do corretor:** filtro "meus leads" por corretor no quadro e na agenda.

**Fora da demo, por decisão:**

- **login do corretor com visão restrita à própria carteira.** Exige
  `brokers.user_id`, papel novo em `tenant_members` e RLS por corretor. Mexe nos
  invariantes de segurança #1 e #2 e merece revisão própria; não se faz com
  pressa;
- **redistribuição por SLA** (o corretor não atendeu em X minutos, o lead
  passa para o próximo). Depende do login, porque é o login que prova o
  atendimento.

---

## 4. Frente B — Cobrança por boleto e Pix

### B1. Princípio: adaptador, não integração

Decidido com o produto: **"os dois, por adaptador"** — Asaas funcionando de
verdade e a porta aberta para o banco do cliente.

```
server/services/payments/
  provider.ts        interface PaymentProvider (nossa, estável)
  asaas.ts           adaptador real (sandbox na demo)
  simulado.ts        adaptador que "emite" e "paga" sem sair do servidor —
                     testes e plano B da demo se a rede falhar
  (depois) banco.ts  bancos diretos via agregador
```

```ts
interface PaymentProvider {
  upsertCustomer(p: Pagador): Promise<{ externalId: string }>
  createCharge(c: CobrancaParaEmitir): Promise<CobrancaEmitida>   // boleto + Pix
  cancelCharge(externalId: string): Promise<void>
  parseWebhook(headers, body): EventoDePagamento | null            // normalizado
}
```

O painel e o banco de dados só conhecem `EventoDePagamento`
(`pago | vencido | cancelado`, valor, data, id do evento). Nome de status do
Asaas (`PAYMENT_RECEIVED`…) nunca sai do adaptador.

**Banco do cliente, depois da demo:** integrar banco a banco (Inter, Sicoob,
BB, Itaú) exige, para cada um, certificado digital ICP-Brasil do CNPJ da
imobiliária, mTLS e homologação com o banco
([Sicoob](https://ajuda.simdata.com.br/homologacao-api-sicoob/),
[Inter](https://blog.tecnospeed.com.br/homologacao-banco-inter/)).
É assim que o concorrente chega a "34 bancos": por **agregador de boleto**
(ex.: Tecnospeed PlugBoleto), uma API só na frente de dezenas de bancos. A
recomendação é o agregador, não N adaptadores. Preço e contrato ainda precisam
ser levantados.

### B2. Quem é dono do dinheiro

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Cada imobiliária usa a própria conta Asaas** e cola a chave de API no painel | Subconta white-label da Moradi | A subconta nasce em "período de avaliação regulatória" de até 60 dias, com **no máximo 10 subcontas e R$ 2.000 emitidos por subconta** ([Asaas](https://docs.asaas.com/docs/criacao-de-subcontas)) — inviável para aluguel. Com a conta própria, o KYC é da imobiliária, o dinheiro entra no CNPJ dela e **a Moradi nunca custodia** (princípio da spec de 01/09) |
| Chave de API **cifrada na aplicação** (AES-GCM, chave em runtimeConfig privado) | texto puro protegido só por RLS | a chave move dinheiro do cliente; um vazamento do banco não pode virar vazamento da chave |
| Webhook identifica a imobiliária pelo **token da URL**, nunca pelo corpo | ler `externalReference` do corpo | invariante #1: `tenant_id` nunca sai do request. O corpo só é confiável depois de conferido contra a cobrança já escopada |
| Liquidação grava com `idempotency_key = 'asaas:' + id do evento` | confiar que o provedor não reenvia | o provedor reenvia; o índice único já existe desde a 0041 |

### B3. Regras de negócio da cobrança

1. **Competência ≠ vencimento** (herdado da 0041): o aluguel de setembro vence
   em outubro. A tela sempre mostra os dois.
2. **Itens** vêm de `charge_items`: aluguel (de `contracts.rent_amount`) mais
   condomínio, IPTU, seguro e outros, lançados à mão. O total emitido é
   **congelado** em `issued_amount` no momento da emissão.
3. **Multa e juros vão no boleto, calculados pelo provedor.** Por contrato:
   - multa moratória padrão **2%**, configurável até **10%**. Na locação, a
     maior parte dos tribunais afasta o CDC e aceita até 10%, desde que esteja
     no contrato
     ([Asaas](https://blog.asaas.com/como-cobrar-juros-de-aluguel-atrasado/),
     [Jusbrasil](https://www.jusbrasil.com.br/artigos/entenda-como-funciona-a-multa-por-atraso-de-aluguel/1238299644));
   - juros de mora **1% ao mês**, pró-rata. O validador recusa acima disso.

   ⚖️ Pendente de advogado: a taxa legal que vale quando o contrato não fala
   de juros. Com a Lei 14.905/2024, o art. 406 do CC passou a seguir a Selic
   deduzido o IPCA. O sistema **não aplica padrão legal**: se o contrato não
   tiver os percentuais, o boleto sai sem multa e sem juros, e o painel avisa.
4. **Estados** são derivados, nunca gravados:
   - `rascunho`: sem `issued_amount`;
   - `emitida`: com `issued_amount`, sem liquidação, não vencida;
   - `vencida`: emitida, sem liquidação e com `due_on` já passado;
   - `paga`: a soma das liquidações cobre o total corrente;
   - `parcial`: a soma não cobre;
   - `cancelada`: tem `canceled_at`.

   Um status gravado divergiria da soma das linhas. Por isso a 0041 escolheu
   derivar.
5. **Cancelar cobrança emitida:** primeiro cancela no provedor e só depois
   grava `canceled_at`. Se o provedor falhar, nada muda aqui. A ordem inversa
   deixaria um boleto pagável com a cobrança cancelada.
6. **Baixa manual** (pagamento em dinheiro ou transferência direta) é uma
   liquidação com `method` próprio, sem `idempotency_key` e com `created_by`.
7. Uma cobrança mensal por contrato e competência: o índice parcial da 0041
   já garante isso.
8. **Repasse ao proprietário:** quando a cobrança fica paga, nasce um
   `owner_payout` **pendente** com o valor recebido menos a taxa de
   administração (`contract_internal.admin_fee_percent`), aplicada sobre o
   **aluguel**, não sobre condomínio nem IPTU, que são repasse puro. Na demo o
   repasse é registrado e marcado como pago à mão; o split automático fica para
   depois.

### B4. O que o inquilino vê

A 0041 decidiu que a Área do Cliente não lê estas tabelas na v1. **Isso muda
aqui, e só em parte.** O inquilino passa a ver, nos contratos em que é
inquilino, o link do boleto, o Pix copia-e-cola, o vencimento e o estado. Não
vê itens internos nem taxa de administração. É o fecho da demo: *"o inquilino
abre o portal e paga ali"*. A leitura acontece por endpoint com recorte
explícito de colunas (invariante #3), nunca por select direto da tabela.

### B5. Privacidade (CLAUDE.md, "Privacidade (LGPD)")

O Asaas passa a receber nome, CPF, e-mail e telefone do inquilino. **No mesmo
PR:**

- incluir o Asaas em "Com quem compartilhamos" na parte da Área do Cliente
  de `privacidade.vue`;
- colocar o host no `privacidade-guardrail.test.ts`;
- atualizar a tabela do runbook.

A base legal é a execução do contrato de locação (art. 7º, V).

---

## 5. Modelo de dados novo (migrations)

| Migration | Conteúdo |
|---|---|
| **0049_crm_historico_agenda** | `lead_events` e `lead_tasks` (RLS de membro + `revoke all from anon`); `leads.lost_reason`; `brokers.receives_leads` e `last_lead_at`; `tenants.lead_distribution`; função `proximo_corretor_da_roleta(tenant)` |
| **0050_cobranca_provedor** | `tenant_payment_accounts` (provedor, ambiente, chave cifrada, token do webhook; **só service_role**); `payment_customers` (pessoa ↔ id no provedor); em `contract_charges`: `provider`, `external_id`, `payment_url`, `digitable_line`, `pix_copy_paste`, `issued_at`; em `contract_internal`: `fine_percent` e `interest_monthly_percent` |

As tabelas financeiras estão vazias. Esta é a janela de migração a custo zero
que a spec de 21/09 descreveu.

---

## 6. Cronograma até a apresentação

| Dia | Entrega | Pronto quando |
|---|---|---|
| **25/09 (hoje)** | Esta spec aprovada. Migrations 0049 e 0050 escritas e revisadas (`migration-author` + `tenant-security-reviewer`) | spec no repo |
| **26/09** | **CRM completo**: repositories e endpoints de eventos, tarefas e roleta; linha do tempo no card do lead; `/admin/agenda`; configuração da roleta | `pnpm typecheck && pnpm test` verde, tela navegável |
| **27/09** | **Cobrança**: serviço de pagamentos (simulado + Asaas sandbox), webhook idempotente, gerar/emitir/cancelar/baixa manual na tela do contrato, repasse pendente | boleto real de sandbox emitido e pago pelo painel do Asaas, baixa chegando pelo webhook |
| **28/09 manhã** | Boleto na Área do Cliente, política de privacidade, tenant de demonstração com dados, roteiro da demo, deploy | ensaio completo em produção com o tenant demo |

**Critério de corte:** se em 27/09 às 18h o Asaas não estiver estável, a demo
usa o adaptador simulado, com a mesma tela e o mesmo fluxo, e o Asaas real vai
para o "próximos dias". O cronograma não estoura por causa de rede de terceiro.

**Depende de vocês, hoje:**

1. Criar conta no **sandbox do Asaas** (sandbox.asaas.com, grátis) e gerar a chave de API.
2. Dizer se a demo usa um tenant novo (`demo`) ou um tenant existente.

---

## 7. Depois da apresentação ("nos dê uns dias")

Ordem por retenção ÷ esforço:

1. Login do corretor com carteira própria (RLS por corretor), com spec e revisão de segurança própria.
2. Geração mensal automática das cobranças, de X a 10 dias antes do vencimento, por cron.
3. Régua de cobrança: lembrete por e-mail/WhatsApp antes do vencimento e no atraso.
4. Split automático do Asaas para o repasse ao proprietário.
5. Reajuste anual (IGP-M/IPCA) e aluguel proporcional no primeiro e no último mês.
6. Extrato do proprietário no portal, derivado de `owner_payouts`.
7. **DIMOB**: o arquivo anual para a Receita sai dos dados de liquidação e
   repasse, com prazo até o último dia útil de fevereiro
   ([gov.br](https://www.gov.br/pt-br/servicos/declarar-atividades-imobiliarias)).
   É argumento de venda forte para o cliente de locação.
8. Banco do cliente via agregador de boleto.
9. Redistribuição de lead por SLA.
10. NFS-e da taxa de administração (spec 01/09, módulo 4).

---

## 8. Fora do escopo, por decisão

| Fora | Por quê |
|---|---|
| Custódia de dinheiro pela Moradi | exige autorização do Banco Central; o provedor é o custodiante |
| Integração direta banco a banco na demo | certificado ICP-Brasil + homologação por banco levam semanas |
| Cartão de crédito | aluguel é boleto/Pix; cartão traz chargeback para dentro do contrato |
| Editor de funil (etapas customizadas) | as etapas são lista fechada em `shared/models/lead.ts` e alimentam métricas; customizar quebra a comparação entre clientes |
| Aplicativo nativo | o painel já é PWA (spec de 09/09) |

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Bug que cobra ou baixa valor errado | append-only, `issued_amount` congelado, idempotência por índice, testes de cada regra do B3 antes da tela |
| Demo cair por rede ou sandbox | adaptador simulado com o mesmo fluxo; critério de corte em 27/09 18h |
| Webhook forjado | token por imobiliária na URL, comparação em tempo constante e evento conferido contra a cobrança escopada antes de gravar |
| Vazar chave de API do cliente | cifrada na aplicação, só a service_role lê, nunca volta ao navegador (o painel mostra só os 4 últimos caracteres) |
| Expurgo LGPD apagar lead ativo | evento e tarefa atualizam `updated_at`, com teste |
