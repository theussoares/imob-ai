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

### B6. Decisões tomadas na implementação (0051, aplicada em 25/09)

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Boleto com `billingType: BOLETO` (Pix impresso no mesmo documento) | emitir boleto e Pix separados | o inquilino escolhe na hora; uma cobrança só para baixar |
| Notificações do Asaas desligadas (`notificationDisabled`) | deixar o Asaas mandar e-mail/SMS | são cobradas por envio na conta da imobiliária, e ninguém pediu isso ao conectar. A régua de cobrança é item da seção 7 |
| Baixa manual de boleto emitido precisa quitar o saldo e baixa o boleto no Asaas (`receiveInCash`) | aceitar baixa parcial | o Asaas só baixa o boleto inteiro; parcial deixaria o boleto pagável pelo valor cheio (inquilino paga em dobro). Para parcial: cancelar e emitir outro |
| Chave de idempotência da liquidação por PAGAMENTO (`asaas:pago:<id>`), igual na baixa manual | por evento | CONFIRMED e RECEIVED do mesmo pagamento, e o eco da nossa baixa manual, colidem na mesma chave |
| Trava de emissão (`issued_at` antes da rede) + cancelamento do boleto órfão | confiar no botão desabilitado | duplo clique ou duas abas geravam dois boletos do mesmo mês |
| URL do webhook nova a cada conexão; segredo guardado só como hash | URL fixa por tenant | webhook antigo que não pôde ser removido passa a bater num id inexistente |
| "Simular pagamento" só com conta E cobrança de sandbox | só checar a conta | conta trocada para produção depois não pode "confirmar" boleto real |
| Estorno do provedor **cancela o repasse pendente** daquela cobrança; repasse já pago fica e vai para o log (`cobranca.estorno_com_repasse_pago`) e para o diário do webhook (`estornada_repasse_ja_pago`) | deixar o repasse de pé e confiar que alguém confira o extrato | a imobiliária transferiria ao proprietário um dinheiro que já voltou ao inquilino. O repasse pago não se desfaz por código: a transferência foi manual (B3.8), e reaver é conversa com o proprietário |
| Depois de estorno, a chave do repasse ganha o número de estornos (`cobranca:<id>:apos-estorno-<n>`) | chave fixa `cobranca:<id>` | o índice único da 0042 não olha `canceled_at`: a cobrança paga de novo colidiria com o repasse cancelado, e o proprietário nunca receberia |
| Feriado bancário nacional (fixos + Carnaval, Sexta Santa, Corpus Christi) no prazo do repasse | ignorar feriado | repasse "até sexta" que cai no feriado é reclamação certa; municipal fica de fora (data editável) |

**Para produção:** definir `NUXT_PAYMENTS_ENCRYPTION_KEY` (32+ caracteres) na Vercel e fazer redeploy. Sem ela, conectar a conta responde 503 legível e o arranque registra `config.segredos_ausentes`.

---

## 4B. Frente C — cadastro de cliente e contrato de locação

Adicionado em 25/09, depois de revisar os fluxos atuais. O diagnóstico: as telas
de Clientes e Contratos nasceram para **publicar PDF na Área do Cliente** e agora
precisam servir para **administrar a locação e cobrar**. Sobra passo, falta dado.

### O que o mercado e a lei dizem (e o que isso decide aqui)

| Fonte | O que diz | Decisão nossa |
|---|---|---|
| Lei 8.245/91, art. 37 e parágrafo único | quatro garantias (caução, fiança, seguro-fiança, cessão fiduciária de quotas); **mais de uma no mesmo contrato é nula** e é contravenção | garantia é **escolha única** (rádio), nunca checkbox |
| Lei 8.245/91, art. 38 §2º | caução em dinheiro **até 3 aluguéis** | o validador recusa caução acima de 3× o aluguel |
| Lei 8.245/91, art. 22, VIII | o seguro contra incêndio é do **locador**, salvo cláusula em contrário | campo "quem paga o seguro incêndio", com padrão locador |
| Lei 8.245/91, art. 46 | prazo **≥ 30 meses** permite retomada sem justificativa no fim do prazo | prazo em meses com atalhos 12 e 30, e a dica do art. 46 no 30 |
| Lei 10.192/2001 | reajuste no mínimo **anual**, no aniversário | índice é lista (IGP-M, IPCA, INPC, IVAR); não existe "periodicidade" para escolher |
| Tabelas CRECI e mercado | taxa de administração de 8% a 10% (mercado 5–12%); taxa de locação costuma ser o 1º aluguel | taxa de administração padrão 10%, e taxa de locação em % do 1º aluguel, padrão 100% |
| Prática de repasse | 3 a 7 dias úteis após o pagamento; sem cláusula, 5 dias úteis é o aceito | repasse em dias úteis, padrão 5 |
| Imobzi | contato e imóvel **precisam existir** antes da locação; garantias: fiador, CredPago, caução, seguro-fiança, título de capitalização, nenhuma; beneficiário do repasse é o proprietário por padrão | criar a pessoa **dentro** do fluxo (é o atrito que o concorrente tem); mesma lista de garantias, com "garantia de empresa (ex.: CredPago)" |
| Kenlo | "não possui garantia" e seguro incêndio podem ser **preenchidos depois**; contrato fica **pendente** até ter o que a cobrança exige | só o essencial é obrigatório; o resto vira **pendência** visível na ficha do contrato |
| NN/g (formulários) | acima de ~10 campos, etapas curtas reduzem o esforço percebido | criação em **4 etapas**; a edição é uma página só com as mesmas seções |

Fontes: [Lei 8.245 art. 37 (Jusbrasil)](https://www.jusbrasil.com.br/topicos/11731475/artigo-37-da-lei-n-8245-de-18-de-outubro-de-1991),
[garantias (Projuris)](https://www.projuris.com.br/blog/garantias-contrato-locacao/),
[art. 22 (Modelo Inicial)](https://modeloinicial.com.br/lei/L-8245-1991/lei-inquilinato/art-22),
[reajuste e Lei 10.192 (ImobiBrasil)](https://www.imobibrasil.com.br/blog/reajuste-de-aluguel-2026-como-calcular-o-igp-m-e-ipca/),
[taxa de administração (Jetimob)](https://www.jetimob.com/blog/taxa-administracao-imobiliaria/),
[prazo de repasse (GeraContratos)](https://geracontratos.com.br/recursos/imobiliaria-nao-repassa-aluguel),
[Imobzi, criar locação](https://help.imobzi.com/pt-br/article/como-criar-uma-locacao-10od3u5/),
[Kenlo, cadastrar contratos](https://fresh.kenlo.com.br/support/solutions/articles/156000020873-novo-locac%C3%A3o-l-como-cadastrar-contratos-de-locac%C3%A3o),
[NN/g, progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

### Cliente não é o mesmo que acesso ao portal

Hoje cadastrar cliente **é** convidar: e-mail obrigatório, convite na hora. Não
dá para ter o fiador que nunca vai entrar, nem o proprietário que só usa
WhatsApp.

- `portal_users.user_id` e `email` passam a aceitar nulo: **cliente sem acesso**.
  Toda regra de segurança do portal compara `user_id = auth.uid()` (conferido no
  banco em 25/09: `is_portal_user`, `portal_my_parties`, `portal_users_read`), e
  `NULL = x` nunca é verdadeiro — cliente sem acesso não enxerga nada, por
  construção.
- "Dar acesso à Área do Cliente" é uma ação separada, que exige e-mail e passa
  pela MESMA regra de token de `convidarClientePortal` (sem exceção nova).
- CPF/CNPJ passa a ser validado por dígito verificador quando preenchido, e é
  **pendência** para cobrar (boleto exige).

### O contrato: 4 etapas na criação

1. **Imóvel e pessoas**: imóvel escolhido da carteira (preenche endereço e
   aluguel) ou endereço digitado; proprietário e inquilino buscados ou
   **criados ali mesmo** (nome e WhatsApp bastam).
2. **Valores e prazo**: aluguel, dia de vencimento, início, prazo em meses
   (término calculado), índice de reajuste, multa (até 10%) e juros (até 1% a.m.).
3. **Garantia e seguro**: uma garantia só, com os campos dela (caução: valor;
   seguro-fiança/título: seguradora e apólice; fiador: a pessoa); quem paga o
   seguro incêndio.
4. **Administração**: taxa de administração, taxa de locação, prazo de repasse,
   destino do repasse (Pix ou conta do proprietário), acesso ao portal de cada
   pessoa com e-mail e "marcar o imóvel como alugado".

Obrigatório para criar: imóvel **ou** endereço, inquilino, aluguel, vencimento
e início. O resto aparece como **pendência** na ficha: sem CPF do inquilino,
sem multa/juros, sem destino de repasse, sem garantia. A cobrança (frente B) lê
as mesmas pendências e não emite enquanto houver uma que a impede.

O código vira automático (`LOC-2026-001`, editável). "Situação" some da
criação: todo contrato nasce ativo, e encerrar é ação da ficha.

### Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Pessoa criada dentro do contrato | exigir cadastro prévio, como o Imobzi | é o atrito que mais atrasa o primeiro contrato, e na demo parece burocracia |
| Pendência em vez de campo obrigatório | tudo obrigatório na criação | contrato antigo sendo migrado raramente tem tudo à mão (o Kenlo chegou ao mesmo lugar) |
| Termos financeiros em `contract_internal` | colunas em `contracts` | `contracts` é lida pelo portal; taxa e repasse são margem da imobiliária |
| Destino do repasse = o do proprietário (`payout_destinations`, 0041) | escolher destino por contrato já | um proprietário por contrato cobre a demo; vários proprietários com percentual é `add column`, não migração |
| Imóvel vira "Alugado" por opção marcada por padrão | automático, sem perguntar | muda o site público; ato que se vê e se desmarca |

### Fora do escopo, por decisão

- **Vários proprietários com percentual e beneficiário diferente do dono.** Existe
  no Superlógica e no Imobzi; entra quando o primeiro cliente tiver um espólio.
- **Geração do PDF do contrato a partir de modelo** (spec de 01/09, módulo 1).
- **Vistoria**: fica como documento anexado, sem laudo estruturado.
- **Aluguel garantido.** A imobiliária paga o proprietário mesmo com atraso do
  inquilino. É produto financeiro, não campo.

---

## 5. Modelo de dados novo (migrations)

| Migration | Conteúdo |
|---|---|
| **0049_crm_historico_agenda** | `lead_events` e `lead_tasks` (RLS de membro + `revoke all from anon`); `leads.lost_reason`; `brokers.receives_leads` e `last_lead_at`; `tenants.lead_distribution`; função `proximo_corretor_da_roleta(tenant)` |
| **0050_contrato_locacao** | `portal_users.user_id`/`email` anuláveis (cliente sem acesso); em `contracts`: `term_months`, `guarantee_type`; em `contract_internal`: garantia (valor, detalhes), seguro incêndio, multa, juros, taxa de locação, prazo de repasse (ver 4B) |
| **0051_cobranca_provedor** (aplicada) | `tenant_payment_accounts` (provedor, ambiente, chave cifrada, token do webhook; **só service_role**); `payment_customers` (pessoa ↔ id no provedor); em `contract_charges`: `provider`, `external_id`, `payment_url`, `digitable_line`, `pix_copy_paste`, `issued_at` |

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
