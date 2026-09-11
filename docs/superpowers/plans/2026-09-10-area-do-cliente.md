# Área do Cliente — escopo, riscos e prazo

**Data:** 2026-09-10
**Motivo:** uma cliente viu a "Área do Cliente" de uma plataforma concorrente e
pediu o equivalente: inquilino e proprietário logando para acessar boletos,
contratos e vistorias. Entra como prioridade 0, saindo direto de `main`.

**Decisões travadas com o Matheus antes de estimar:**

- **Origem dos dados: upload manual pelo painel.** A imobiliária sobe os PDFs;
  não há integração com ERP nesta entrega. Isso tira do prazo a maior fonte de
  risco (depender da API de terceiro) e coloca no lugar um custo operacional
  recorrente — ver "O que ninguém vê no print", abaixo.
- **Escopo: completo.** Inquilino e proprietário, com boleto, 2ª via, contrato,
  vistoria e extrato de repasse.

## O ponto de partida honesto

O imob-ai **não tem nada de locação**. Uma busca por contrato, boleto, vistoria e
inquilino no repositório inteiro devolve três resultados, todos coincidência de
palavra em comentário. Não existe contrato, não existe documento, não existe
cliente-pessoa: `aluguel` hoje é só um valor da coluna `purpose` de um imóvel de
catálogo.

Ou seja: isto não é uma tela nova. É um **segundo produto autenticado** dentro do
mesmo app — outro tipo de usuário, outro domínio de dados, outro nível de sigilo.

## A decisão central: o cliente não é membro

Hoje o único usuário autenticado é a imobiliária, e `is_tenant_member()` libera
**20 policies** — imóveis com nome e telefone do proprietário, corretores, leads,
configurações do site.

Dar ao inquilino uma linha em `tenant_members`, ainda que com um papel novo,
entregaria a base inteira da imobiliária para o cliente dela. Por isso:
`portal_users` é tabela própria, com predicado próprio (`is_portal_user`), e não
há caminho de um para o outro. As duas portas de entrada no servidor
(`requireTenantMember` e `requirePortalUser`) são simétricas e mutuamente
exclusivas.

## Modelo de dados

```
portal_users            o cliente (inquilino / proprietário / fiador)
contracts               o contrato de locação
contract_parties        quem está em qual contrato, em que papel
portal_documents        o arquivo publicado, com público-alvo e data de publicação
portal_document_access  trilha de download (LGPD)
```

Duas escolhas que valem registro:

- **O papel fica na relação, não na pessoa.** Quem aluga um imóvel e é dono de
  outro é inquilino num contrato e proprietário no outro, com a mesma conta. Se o
  papel fosse atributo do usuário, esse caso viraria duas contas e dois e-mails.
- **`contracts.source` e `contracts.external_id` já nascem na tabela**, mesmo com
  a entrega sendo 100% manual. Quando a integração com ERP entrar, o mesmo
  contrato passa a chegar com `source='erp'` sem migrar tabela nem reescrever a
  área do cliente. Duas colunas hoje custam nada e evitam o retrabalho inteiro.
- **`due_day`, `admin_fee_percent` e `adjustment_index` pelo mesmo motivo**, e
  com um agravante: contrato é dado que uma pessoa digitou. Acrescentar a coluna
  depois não é rodar migration — é pedir que a imobiliária reabra cada contrato
  para preencher o que faltava. Nenhuma tela da Área do Cliente usa os três; eles
  existem para que cobrança e repasse encaixem sem reabrir cadastro.

## A regra de acesso, e por que ela está em dois lugares

"Este cliente pode ver este documento?" = **publicado** + **do contrato dele** +
**endereçado ao papel dele naquele contrato**.

A regra existe como policy de RLS (migration 0028) e como função pura em
`shared/utils/portal-access.ts`. A duplicação é deliberada: o download é assinado
pela *service role*, que **ignora RLS** — porque o cliente não tem policy de
leitura no bucket privado. Nesse caminho, a função em TypeScript é a única
barreira entre o inquilino e o extrato de repasse do proprietário. Por isso ela é
pura e coberta por teste.

O default de público-alvo por categoria também é código, não caixinha no
formulário: boleto e recibo nascem só do inquilino, extrato só do proprietário.
O vazamento clássico desta feature é o proprietário vendo os dados de pagamento
de quem mora no imóvel — e ele acontece quando alguém esquece de marcar o campo
às 18h de uma sexta.

## Achado de segurança encontrado no caminho (não corrigido ainda)

**As colunas internas de `properties` estão protegidas apenas contra o papel
`anon`.**

A migration 0011 faz `revoke select on public.properties from anon` e devolve
o `grant` só nas colunas públicas — deixando `owner_name`, `owner_phone`,
`location` e `broker_id` de fora. Mas o `revoke` nunca foi aplicado ao papel
`authenticated`, que mantém o `grant` default do Supabase sobre a tabela inteira.

Hoje isso não vaza nada: todo usuário autenticado é membro da imobiliária e
deveria mesmo ver esses campos. **No dia em que dermos login para inquilinos e
proprietários, cada cliente com senha passa a conseguir ler nome e telefone do
proprietário de todo imóvel ativo** — de todos os tenants — usando a anon key,
que vai no HTML de toda página, mais o próprio token.

A policy `properties_public_read` não protege: RLS filtra linha, não coluna.

Correção (entra na Fase 0, é pré-requisito de segurança para o portal existir):
`revoke select on properties from authenticated` + `grant` das colunas públicas,
e os dois endpoints de leitura do painel (`/api/admin/properties`) passam a ler
pela service role com filtro de tenant explícito — o padrão que
`member.repository.ts` já usa.

## O que ninguém vê no print

O print do concorrente diz: *"Todos os proprietários recebem mensalmente um
e-mail com seus dados de acesso."* Duas consequências que precisam estar no
prazo:

1. **SMTP próprio é dependência, não detalhe.** O SMTP embutido do Supabase
   limita a poucos envios por hora e sai do domínio dele, caindo em spam — foi
   exatamente por isso que o convite de usuários do painel entrega link copiável
   em vez de e-mail. Para um disparo mensal a uma carteira inteira, isso não
   serve: precisa de Resend ou SES com domínio verificado.

   **Decisão (2026-09-11): o envio sai do domínio da plataforma
   (`usemoradi.com.br`), não do domínio de cada cliente.** Verificar o domínio de
   cada imobiliária significa uma rodada de DNS por cliente, para sempre, com
   quem muitas vezes não controla o próprio DNS — e é o tipo de trabalho que não
   aparece na estimativa e aparece no onboarding. Com um domínio só, SPF, DKIM e
   DMARC são configurados uma vez, a reputação de envio é construída uma vez, e
   cliente novo custa zero.

   O preço é a marca no remetente, e ele se paga barato: o nome de exibição leva
   o nome da imobiliária e o `Reply-To` leva o e-mail real dela — o cliente final
   vê "Imobiliária X" na caixa de entrada e responde para a imobiliária. Domínio
   de envio próprio (`mail.<dominio-do-cliente>` por CNAME) fica como upgrade
   para quem pedir e controlar o DNS, sem bloquear ninguém.

   Nesta primeira cliente o DNS é gerenciado pelo próprio Matheus, o que remove
   o risco de cronograma — mas a decisão acima não é sobre ela, é sobre o
   segundo, o quinto e o vigésimo cliente.
2. **Upload manual é trabalho recorrente da imobiliária.** Com a carteira dela,
   é uma pessoa subindo um boleto por contrato, todo mês, para sempre. A feature
   não morre de bug — morre de fadiga operacional no terceiro mês. Por isso a
   Fase 1 inclui envio em lote, e por isso a integração com ERP é a sequência
   natural (e o schema já está preparado para ela).

## Atualização de 2026-09-11: a carteira tem 10 casas

A cliente informou o tamanho real: **10 imóveis locados**. Isso recalibra três
coisas do plano acima e não muda o prazo.

- **O custo operacional do upload manual deixa de ser argumento.** 10 boletos por
  mês são minutos, não fadiga. O envio em lote sai da Fase 1 (economia de ~1 dia,
  total passa a 15–19 dias úteis); entra de volta quando a carteira crescer, que
  é exatamente a preocupação que ela verbalizou ("quando tivermos mais imóveis
  pode virar uma bola de neve").
- **O que ela está comprando é organização, não alívio.** Ela não está em dor
  hoje; está evitando a dor futura. Isso favorece a Área do Cliente como está
  desenhada e desfavorece antecipar cobrança automática.
- **A cobrança automática vira decisão de produto, não atendimento.** A 10
  contratos, a integração não se paga por esta cliente. Se for feita, é porque
  serve os outros tenants e as vendas seguintes — não porque ela precisa.

**Como o inquilino paga hoje: Pix.** Não existe boleto na operação dela — a
intenção de migrar para boleto é futura e sem data. Duas consequências:

- **O marco da semana 4 não pode depender dessa migração.** Se ela ainda não
  tiver trocado, uma tela chamada "Boletos" fica vazia e o marco vira vexame.
  A seção é de **pagamentos**, e mostra o que existir: hoje o comprovante de Pix,
  amanhã o boleto. O enum `portal_doc_category` já cobre os dois (`recibo` e
  `boleto`) — nada a mudar no schema.
- **Se ela vai migrar mesmo, que migre direto para o provedor que escolher**
  (Cora ou Asaas), não para a emissão pelo banco dela. Senão faz a mudança
  operacional duas vezes, e na segunda resiste.

Vale também questionar a premissa com ela: o que ela pediu foi organização, e
organização vem do sistema, não do instrumento de pagamento. **Pix cobrança com
vencimento** — que os dois provedores emitem, com multa, juros e data — organiza
igual, concilia na hora (o webhook dispara no instante do pagamento, não no dia
seguinte) e é mais barato que boleto. O caminho que evita a escolha é a cobrança
híbrida: um documento só, com código de barras e QR, que o inquilino paga como
preferir e que concilia por um caminho só.

Registrado também: o **Cora** que apareceu na conversa é do contador dela, usado
para cobrar a imobiliária — a imobiliária não tem conta de cobrança nenhuma. Ela vai abrir uma (Cora ou
Asaas, escolha dela). Os dois têm API de emissão e webhook de baixa; o passo mais
barato da integração continua sendo assinar só o webhook, sem emitir nada, para o
portal mostrar "pago / em aberto" sozinho.

## Atualização de 2026-09-11 (fim do dia): a feature vira plano pago

Duas decisões que mudam a ordem de execução, sem mudar o prazo combinado.

### A Área do Cliente é vendida à parte

É a primeira feature que entra como **plano superior na mensalidade**, não como
melhoria incluída. O mecanismo é um recurso ligado por tenant
(`tenant_features`), e não uma coluna `plan` com enum: os nomes dos planos ainda
não existem porque nada foi vendido, e errar o nome do tier custa migration.
Quando houver um segundo recurso pago, `plan` vira um atalho que resolve para um
conjunto de recursos.

A checagem mora em dois lugares que já existem: dentro de `is_portal_user()` — e
como essa função gatilha todas as policies do portal, o recurso desligado passa a
fechar o acesso **no banco**, em todo caminho — e em `requirePortalUser`, para
devolver erro legível em vez de lista vazia.

### Política de inadimplência — decidida em 11/09

A pergunta era: o que acontece quando a imobiliária para de pagar, se os
documentos são dos clientes dela? A pesquisa jurídica separou duas coisas que
pareciam uma só.

**Suspender o serviço é legítimo; reter os dados é abusivo.** O provedor pode
suspender acesso por inadimplência desde que isso esteja *expresso no contrato* e
com notificação prévia — mas reter os dados brutos do cliente viola propriedade e
princípios da LGPD. Há precedente do lado errado disso: agência condenada a
indenizar por bloquear o acesso de cliente inadimplente, porque o contrato previa
apenas multa e não mencionava suspensão. Sem cláusula, o corte é ilícito mesmo
com o cliente devendo.

**E a cadeia de responsabilidade alivia a preocupação.** Na LGPD a imobiliária é
**controladora** e o imob-ai é **operador** — trata dados apenas sob instrução
dela. O direito do inquilino de acessar o próprio contrato (art. 18) é devido
**pela imobiliária**. Cortar o portal não retira esse direito, desde que os dados
permaneçam devolvíveis a ela. O que quebraria a cadeia seria cortar *e* segurar
os arquivos.

**A régua adotada:** vencimento sem efeito e aviso automático; segundo aviso em
D+7; suspensão do portal em **D+15**; janela de exportação até D+90; eliminação
depois, com as exceções do art. 16.

Três regras que a implementação não pode perder:

1. **O painel da imobiliária nunca é cortado por este entitlement** — só o portal.
   Cortar o painel *é* reter dados, e é a conduta do precedente.
2. **A tela de suspensão não menciona pagamento.** O inquilino vê
   "temporariamente indisponível, fale com a imobiliária". Expor a inadimplência
   dela aos clientes dela é dano à imagem de terceiro.
3. **`portal_document_access` não entra no expurgo** — é registro de operação de
   tratamento e tem base própria para sobreviver.

Fora do código: a cláusula de suspensão **precisa existir no contrato** com a
imobiliária. Isso é trabalho de advogado, não de desenvolvimento.

O schema não muda: `enabled` + `grace_until` já expressam a régua acima.

### O demo da semana 2 vai para produção, não para staging

Defensável porque a Área do Cliente é **auto-fechada** (ninguém entra sem
convite) e porque o dado é o contrato real dela, no tenant dela. O entitlement
acima é o que garante que os outros dois clientes não vejam nada.

Isso dispensa o projeto de staging de US$ 10/mês até a semana 2, e dispensa
inteiramente o dilema do plano Free (que pausa após 7 dias ocioso — inaceitável
num link que a cliente vai abrir).

### A reordenação, e o motivo dela

O caminho completo até "ela loga e baixa" soma **14,5 dias úteis**. A semana 2
tem **10**. Não fechava.

O que destrava: **o demo não precisa do painel.** O compromisso enviado foi *"você
entra num link de teste e baixa o contrato e a vistoria"* — ela entra e baixa, não
cadastra. Então o contrato dela é cadastrado à mão pelo dashboard (dado real, no
tenant certo) e a Fase 1 inteira sai do caminho crítico:

`0.0 → 0.2 → 0.6 → 0.3 → 0.5 → 2.1 → 2.2 → 2.3` = **9 dias**, com um dia de folga.

Ficam para depois do demo: e-mail transacional (0.4), o painel inteiro (1.1–1.3)
e o polimento de mobile (2.4). O total não muda; muda a ordem — e o painel passa a
ser construído depois de ela usar, alimentado pelo que ela reclamar, em vez de no
escuro.

O card 3.3 deixou de ser "primeiro contrato real em produção" e virou "abrir para
a carteira", que é o que de fato encerra o projeto.

## Fases e prazo

Estimativa em dias úteis de trabalho efetivo.

| Fase | Entrega | Dias |
|---|---|---|
| 0 | Fundação e blindagem | 4–5 |
| 1 | Painel: contratos, clientes e documentos | 5–6 |
| 2 | Área do cliente (front) | 4–5 |
| 3 | Endurecimento, LGPD e produção | 3–4 |
| | **Total** | **16–20** |

**Fase 0 — Fundação e blindagem (4–5 dias)**
- [x] Migration 0028: schema, RLS, bucket privado, trilha de download
- [x] Modelos de domínio + regra de acesso pura + 11 testes
- [x] `requirePortalUser` (a porta do cliente, espelho da porta do painel)
- [ ] Fechar a brecha de colunas de `properties` para `authenticated` — 1 dia
- [ ] Mappers e repositories das 5 tabelas novas — 1 dia
- [ ] SMTP próprio (Resend/SES) + template de convite — 1 dia
- [ ] Auth do portal no client: `storageKey` separado do painel, middleware,
      login e definir-senha — 1,5 dia

**Fase 1 — Painel (5–6 dias)**
- CRUD de contrato, vínculo com imóvel e com as partes — 2 dias
- Convidar cliente, listar, reenviar, desativar — 1,5 dia
- Upload de documento: categoria, competência, público-alvo, publicar — 2 dias
- Envio em lote dos boletos do mês — 1 dia

**Fase 2 — Área do cliente (4–5 dias)**
- Login e recuperação de senha — 0,5 dia
- "Meus contratos" e detalhe do contrato — 1,5 dia
- Documentos por categoria, download assinado, 2ª via, trilha — 1,5 dia
- Mobile de verdade e estados vazios/erro — 1 dia
- Entrada no site (header/rodapé) — 0,5 dia

**Fase 3 — Endurecimento, LGPD e produção (3–4 dias)**
- Rate limit no download, expiração curta da URL assinada, teste de que o
  cliente A não alcança o documento do cliente B — 1,5 dia
- `/security-review` e correções — 1 dia
- Política de privacidade e retenção atualizadas — 0,5 dia
- Deploy, primeiro contrato real cadastrado junto com a imobiliária — 1 dia

### Prazo a passar para a cliente

**5 semanas**, com dois marcos visíveis antes do fim:

- **Semana 2** — ela entra num link de teste, com um contrato real dela
  cadastrado, e baixa o contrato e a vistoria pelo celular.
- **Semana 4** — boletos, 2ª via e extrato no ar em produção, para os primeiros
  contratos.
- **Semana 5** — endurecimento, LGPD e abertura para a carteira.

**A condição que sustenta o prazo:** a imobiliária precisa entregar, ainda na
semana 1, **um contrato real com os PDFs correspondentes** (contrato assinado,
uma vistoria, um boleto, um extrato). Sem um caso real para modelar, a estimativa
escorrega — é o material que define nomenclatura, o que é sigiloso e o que a
pessoa espera encontrar na tela.

## Fora do escopo, por decisão

- **Integração com ERP.** Fica para a fase seguinte; o schema já está preparado
  (`source`, `external_id`). Vira prioridade quando o volume de upload manual
  incomodar — e vai incomodar.
- **Pagamento dentro do portal.** Emitir ou registrar boleto é operação
  financeira regulada, com outro nível de responsabilidade. Aqui a 2ª via é o
  arquivo que a imobiliária publicou.
- **Chat / chamado dentro da área do cliente.** O canal dela é o WhatsApp, que já
  está no site.
- **Inquilino vendo os dados do proprietário (e vice-versa).** As policies
  deliberadamente não expõem as outras partes do contrato. Se for pedido, é
  decisão de produto — não pode entrar por efeito colateral de policy.
