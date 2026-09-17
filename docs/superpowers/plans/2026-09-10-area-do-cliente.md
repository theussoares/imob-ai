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
- [x] Mappers e repositories das 5 tabelas novas — 1 dia
- [x] SMTP próprio (Resend/SES) + template de convite — 1 dia
- [x] Auth do portal no client: `storageKey` separado do painel, middleware,
      login e definir-senha — 1,5 dia

**Fase 1 — Painel (5–6 dias)**
- [x] CRUD de contrato, vínculo com imóvel e com as partes — 2 dias
- [x] Convidar cliente, listar, reenviar, desativar — 1,5 dia
- [x] Upload de documento: categoria, competência, público-alvo, publicar — 2 dias
- Envio em lote dos boletos do mês — 1 dia

**Fase 2 — Área do cliente (4–5 dias)**
- [x] Login e recuperação de senha — 0,5 dia
- [x] "Meus contratos" e detalhe do contrato — 1,5 dia
- [x] Documentos por categoria, download assinado, trilha — 1,5 dia
- [~] Mobile de verdade e estados vazios/erro — 1 dia
- [x] Entrada no site (header/rodapé) — 0,5 dia

### 16/09 — a pasta de migrations não é a produção

Ao ir aplicar as migrations, o banco real contou outra história. **O histórico de
produção não bate com esta pasta**, e nem é um subconjunto dela:

- os números 0028–0030 em produção são `tenant_address`, `tenant_about_page` e
  `broker_public_profile` — nomes que não existem aqui;
- a área do cliente foi aplicada como `client_area` (12/09), junto com
  **`tenant_features`** e uma **`corrigir_recursao_policies_portal`** que não
  está nesta pasta em lugar nenhum.

O que isso significa, ponto a ponto:

**1. `tenant_features` já existia — eu estava errado.** Minha conclusão de que
"nunca existiu" valia para o repositório e era falsa para o sistema. Em produção
a tabela está lá desde 12/09, com `enabled`, `grace_until` (tipo `date`),
`enabled_at` e `notes`, e `is_portal_user()` **já a consulta**. O entitlement
está implementado e ligado.

**2. `is_portal_user()` É usada por policy.** Minha outra conclusão — de que
nenhuma policy a chamava — também valia só para a pasta. Em produção
`contract_parties_read` a chama diretamente, e `portal_my_parties()` a chama
também, o que a leva para `contracts_read` e `portal_documents_read`.

**3. A 0036 que escrevi foi descartada.** Ela recriaria `tenant_features` com
`grace_until timestamptz` (a produção usa `date`), substituiria
`is_portal_user()` por uma versão com semântica diferente, e — o pior —
reescreveria `contracts_read` e `portal_documents_read` com as subqueries inline
da 0028, **reintroduzindo a recursão** que a `corrigir_recursao_policies_portal`
existe para resolver. Aplicá-la teria derrubado o portal.

**4. A 0034 foi reescrita contra o estado real.** O furo de pasta continua aberto
em produção: `portal_can_read_doc_path()` casa `storage_path` com o nome do
objeto e não confere a pasta. A correção agora entra DENTRO dessa função,
preservando o desenho de lá, em vez de recriar a policy como a 0028 a definia.

**5. `recursoAtivo` estava um dia adiantada.** Eu escrevi `graceUntil > now()`;
o banco usa `coalesce(grace_until,'-infinity') >= current_date` — `>=` e por
DIA. No próprio dia da carência o servidor devolveria 403 enquanto a RLS ainda
liberava, e o suporte procuraria o problema no lugar errado. Alinhado e coberto
por teste.

**O que de fato falta aplicar:** 0032 (valor novo no enum), 0033
(`last_recovery_at`) e 0035 (`tenants.portal_enabled`) — todas aditivas — e a
0034 reescrita, que é a única que toca comportamento existente.

**Aplicadas em produção em 16/09** (as três aditivas, uma a uma, conferidas
depois de cada uma):

| Migration | Estado |
|---|---|
| `contrato_administracao` (0032) | ✅ enum passou a ter o valor |
| `portal_recovery_cooldown` (0033) | ✅ `last_recovery_at timestamptz` |
| `tenant_portal_enabled` (0035) | ✅ `boolean default false` — 0 de 4 tenants ligados |

Advisors de segurança rodados depois: só os avisos pré-existentes (os cinco
`security definer` expostos por RPC, que a 0028 já documenta como dívida, e a
proteção de senha vazada, que é configuração de Auth). Nada regrediu.

O banco também mostrou o que já está em uso: **2 clientes cadastrados** e o
entitlement `portal` ligado para `olmi` e `demo`.

**A 0034 também foi aplicada, isolada e verificada contra o banco real.**

Antes de aplicar: conferido que os 7 documentos existentes têm a primeira pasta
igual ao slug do tenant — nenhum download em uso seria bloqueado pela função
nova. (São todos do tenant `demo`; ainda não há documento de cliente real.)

Depois de aplicar, o trigger foi exercitado de verdade, em produção, com as
três tentativas desfeitas no fim:

| Tentativa | Resultado |
|---|---|
| `storage_path` na pasta de outra imobiliária | recusado ✅ |
| travessia com `..` | recusado ✅ |
| caminho legítimo | aceito ✅ |

Confirmado depois: 7 documentos (o mesmo de antes), nenhuma linha de teste
sobrando, trigger ativo, `portal_can_read_doc_path` conferindo a pasta **e**
ainda usando `portal_my_parties()` — ou seja, a correção de recursão foi
preservada.

É a primeira verificação desta entrega feita contra o banco de verdade, e não
contra teste ou fake.

**Dois itens de configuração que o banco revelou:**

- `tenants.portal_enabled` está `false` para todos. O link no site não aparece
  em lugar nenhum até alguém ligar para a OLMI — que é o padrão desejado, mas
  precisa ser ligado antes de anunciar.
- **Proteção de senha vazada está desligada no Auth.** Um clique no painel do
  Supabase, e vale especialmente aqui: o portal é para cliente final, que
  escolhe senha fraca. Não é dívida de código.

**Dívida que isto expõe:** enquanto a pasta e o banco divergirem, toda migration
nova é escrita contra uma ficção. Antes de seguir, vale trazer para cá as três
migrations que só existem em produção.



O entitlement decidido em 11/09 virou a **0036**. Mas o plano dizia que a
checagem devia morar dentro de `is_portal_user()`, *"e como essa função gatilha
todas as policies do portal, o recurso desligado passa a fechar o acesso no
banco, em todo caminho"*.

**`is_portal_user()` não gatilha nada.** Ela foi criada na 0028 e **nenhuma
policy a chama** — as policies do portal fazem a checagem inline
(`pu.user_id = auth.uid() and pu.active`). Mudar só a função teria dado a
sensação de fechar o acesso sem fechar coisa alguma. Por isso a 0036 é maior do
que o plano previa: o recurso entra nas quatro policies do portal e na policy do
bucket, uma a uma, sempre no termo do CLIENTE.

Dois comentários no código repetiam a mesma premissa falsa (em
`portal-user.repository.ts` e no endpoint de desativar cliente, os dois dizendo
que `is_portal_user()` recusa a pessoa). Corrigidos.

As três regras do plano estão respeitadas e travadas por teste:

1. **O painel nunca é cortado.** O conjunto do recurso só aparece no termo do
   cliente — há teste varrendo a migration linha a linha para garantir que
   `tenant_feature_ativa` nunca apareça colado em `is_tenant_member`. Cortar o
   painel *é* reter dado do cliente, e é a conduta do precedente citado no plano.
2. **A suspensão não menciona pagamento.** Teste sobre o literal da mensagem,
   recusando "pagamento", "fatura", "inadimplência", "plano".
3. **`portal_document_access` não é tocada.**

A carência virou função pura (`recursoAtivo`), usada pelo servidor e coberta por
teste: ausência de registro é DESLIGADO (lado seguro para recurso pago),
`enabled` vale sozinho, e `grace_until` no futuro mantém o acesso mesmo
desligado — que é a régua de inadimplência sem precisar de coluna de estado.

A semeadura liga o recurso para todo tenant que **já tem cliente cadastrado**:
trocar as policies sem isso cortaria quem está usando por causa de uma migration
de infraestrutura.

Relação com a 0035: `tenants.portal_enabled` continua sendo só exibição (mostra
o link no site). O acesso é a 0036. Um tenant pode ter o recurso ligado e o link
desligado — é exatamente o caso do demo, em que ela entra por link direto antes
de anunciar.

**Card 2.4 (16/09) — o que ficou e o que não ficou.**

Feito: link "Área do Cliente" no topo e no rodapé, estados vazios com
instrução, e a classificação de falha (`classificarFalha`) que separa sessão
caída, falha de rede, permissão e 404 — "não foi possível carregar" serve para
tudo e não diz o que fazer, e no celular a falha de rede é a mais comum e a
única em que "tente de novo" ajuda.

**Não feito: testar em aparelho real.** Tentei rodar o app aqui com o Chromium
disponível; as páginas respondem 500 porque a resolução de tenant precisa de um
Supabase, e não há banco neste ambiente. Ficam no lugar três travas mecânicas
(`test/shared/portal-mobile.test.ts`): largura fixa maior que 360px, `min-width`
que impede encolher, e fonte de input abaixo de 16px, que dispara o zoom do
Safari. Elas pegam o que quebra sem ninguém ver no desktop; **não** pegam fonte
pequena, alvo de toque apertado nem rolagem travada. Esse item continua aberto e
é de quem tiver um celular na mão.

**Achado no caminho: `tenant_features` nunca existiu.** O plano decidiu em 11/09
que a Área do Cliente é plano pago, com o recurso lido dentro de
`is_portal_user()` para fechar o acesso no banco. Essa tabela não está em
migration nenhuma, em código nenhum, e nem virou card. Como o link no site
público precisava de alguma condição, entrou a **0035** (`tenants.portal_enabled`),
que é interruptor de EXIBIÇÃO e nada mais — desligar tira o link do site, não
fecha o portal. Nasce `false`, então ninguém ganha o link sem alguém ligar.
O entitlement de verdade continua pendente e precisa existir antes de abrir para
o segundo cliente.

**Achado no card 1.3 (16/09):** o upload vai direto do navegador para o
Storage, então o `storage_path` é **dado do cliente**. Sem conferir o prefixo,
um membro da imobiliária A registraria uma linha em `portal_documents` (no
tenant dele) apontando para um arquivo da pasta da imobiliária B — e a policy do
bucket assinaria o download, porque ela casa `storage_path` com o nome do objeto
e confere o contrato, não a pasta. As policies de storage impedem A de LER a
pasta de B, mas não de apontar para ela. Fechado por `assertCaminhoDoTenant`
(prefixo `<slug>/` e recusa de `..`), travado por teste e conferido por mutação.

### Revisão de segurança (16/09) — três achados, todos corrigidos

Rodada sobre o diff inteiro da branch, com sub-agente. Os dois fatos
verificáveis foram conferidos direto no código antes de aceitar os achados.

**1. A guarda de caminho era só da aplicação.** `assertCaminhoDoTenant` estava
documentada como a fronteira, mas vive no endpoint — e o endpoint não é o único
caminho até a tabela. A 0028 revoga privilégios de `portal_documents` só de
`anon`; `authenticated` mantém o GRANT default, e a policy de escrita valida
apenas `tenant_id`. Um membro do painel insere a linha pelo PostgREST com
`storage_path` apontando para a pasta de outra imobiliária, e a policy do bucket
assina o download — ela casava nome de objeto, não pasta. Corrigido na **0034**:
trigger no banco (prefixo do slug, sem `..`, contrato do mesmo tenant) e a
policy do bucket passa a exigir que a pasta do objeto seja do tenant do
documento. A função no repositório continua, agora como 403 legível.

**2. O convite virava ferramenta de phishing.** A versão anterior gerava link de
`recovery` para qualquer e-mail com conta preexistente. Isso deixava qualquer
membro de qualquer tenant forçar a redefinição de senha de uma conta alheia —
inclusive a de um admin concorrente, que usa o mesmo `auth.users` — num e-mail
autêntico do domínio verificado da plataforma, com nome de exibição e Reply-To
vindos de campos que a própria imobiliária edita. O raciocínio de que "mandar
por e-mail elimina o risco" cobria só o roubo pelo convidante. Agora o token sai
em **dois casos**: conta que nasceu agora, ou reenvio para quem já é cliente
deste tenant. No terceiro caso o aviso vai **sem token** (`emailAcessoLiberado`),
e a tela explica. Travado por teste, conferido por mutação.

**3. Open redirect com credencial.** `adminHostAction` passou a montar um
redirect ABSOLUTO com host derivado de `getHostname`, que confia em
`X-Forwarded-Host`, preservando a query — onde o Supabase põe o `?code=`. Antes
da branch o redirect era relativo, então a confiança no header era inofensiva;
esta entrega a tornou carregadora de token. Agora a função devolve host e
destino separados e o **middleware resolve o tenant do host antes de
redirecionar**, caindo em `/admin` se não resolver.

Também corrigido, fora dos achados: `mailer.ts` registrava o endereço do
destinatário no log, contra a regra de PII do `log.ts` seguida no resto da
feature.

**Os dois pontos que ficaram abertos na revisão (16/09), resolvidos:**

- **O destino do link não vem mais de header.** `redirectTo` saía de
  `getRequestURL(event).origin`, que é `Host`/`X-Forwarded-Host` — dado do
  cliente — e o link carrega `?code=`. Num endpoint público como o de
  recuperação, um header forjado faria o e-mail da vítima chegar apontando para
  o servidor de quem forjou. A allowlist de Redirect URLs do Supabase barra
  isso hoje, mas é configuração fora do repositório e não dá para depender dela
  em silêncio. Agora a origem sai do banco (`portalOrigin`): domínio primário do
  tenant, ou o subdomínio da plataforma. Sem `platformDomain` configurado, falha
  alto em vez de inventar um host.
- **Conta de equipe não vira cadastro de cliente.** `auth.users` é compartilhado
  entre painel e portal, então uma imobiliária podia cadastrar o operador de
  outra como "cliente", com nome, CPF e telefone digitados por terceiro. Agora é
  recusado no cadastro novo (não no reenvio, que quebraria um vínculo já
  existente), com mensagem que **não** revela que o endereço é de equipe — quem
  cadastra não precisa descobrir isso pelo erro.

**Ajuste no card 1.2 (16/09):** o card mandava repetir a proteção de
`inviteMember` — não devolver link quando o e-mail já tem conta. Ela existe lá
porque aquele fluxo **devolve um link copiável** para quem convidou (foi escrito
antes de haver mailer), e entregar link de conta alheia é escalação de
privilégio. No portal o link **só vai para a caixa de entrada do convidado** e
nunca volta na resposta, então o risco não existe — e tratar conta já existente
como caso normal é o que faz o reenvio funcionar. Conta existente recebe link de
`recovery`, porque `generateLink({type:'invite'})` recusa e-mail já cadastrado:
sem isso, reenviar convite não mandaria nada.

**Conflito resolvido no card 2.3 (15/09):** o card mandava assinar o download
com service role; a migration 0028, escrita depois, mudou o desenho e criou a
policy `portal client reads own documents` no bucket para haver uma segunda
barreira no banco. Vale a 0028 — a assinatura usa o token do cliente, e a
service role fica só para a trilha de acesso, que o cliente não pode forjar.
Assinar com service role deixaria a policy como código morto sem nenhum sintoma,
então a decisão é travada por teste no fonte
(`test/server/portal-payload-guardrail.test.ts`), não só por comentário.
- Login e recuperação de senha — 0,5 dia
- "Meus contratos" e detalhe do contrato — 1,5 dia
- Documentos por categoria, download assinado, 2ª via, trilha — 1,5 dia
- Mobile de verdade e estados vazios/erro — 1 dia
- Entrada no site (header/rodapé) — 0,5 dia

**Fase 3 — Endurecimento, LGPD e produção (3–4 dias)**
- [x] Rate limit no download, expiração curta da URL assinada, teste de que o
      cliente A não alcança o documento do cliente B — 1,5 dia

**Card 3.1 (16/09) — feito em duas camadas, porque uma só não prova.**

`test/server/portal-isolation.test.ts` roda no CI: 33 testes, com a matriz
categoria × papel escrita à mão (derivá-la de `defaultAudienceFor` faria o teste
concordar consigo mesmo e não com a intenção), o caminho do download assinado —
que não passa por RLS de tabela — e a garantia de que lista e download aplicam a
MESMA regra, porque discordar é o pior dos dois mundos.

`supabase/tests/isolamento-portal.sql` roda contra o banco: **17 verificações
contra as policies reais**, personificando clientes de verdade com
`set local role authenticated` + `request.jwt.claims`. Rodadas em produção em
16/09, todas verdes:

| | |
|---|---|
| inquilino não vê extrato / proprietário não vê recibo | ✅ |
| rascunho invisível, cliente vê só a própria linha de cadastro | ✅ |
| download: assina o próprio, recusa o do outro, recusa pasta alheia | ✅ |
| cross-tenant: nenhum vínculo nem contrato fora do próprio tenant | ✅ |
| anônimo não alcança nada | ✅ |
| entitlement desligado fecha; carência futura mantém; vencida fecha | ✅ |

O bloco do entitlement desliga e religa dentro do mesmo `do $$` — sendo um só
comando, se algo falhar no meio o Postgres desfaz tudo. Conferido depois que
`demo` e `olmi` voltaram a `enabled=true, grace_until=null`.

**Por que as duas camadas.** A de código prova o que o código faz; não prova o
que o banco faz, e é o banco que isola. A migration descartada em 16/09 teria
reintroduzido uma recursão que derruba o portal, e a suíte de vitest passaria
verde — ela lê a pasta, não o banco. Nenhuma das duas substitui a outra.
- [x] `/security-review` e correções — 1 dia
- [~] Política de privacidade e retenção atualizadas — 0,5 dia

**Card 3.2 (16/09).**

Verificado contra o banco real, não por suposição:

- **`anon` sem grant algum** nas sete tabelas do portal ✅
- **A trilha de auditoria e o `tenant_features` estavam protegidos só pela
  AUSÊNCIA de policy de escrita.** Funcionava — um membro do painel não apaga a
  trilha nem liga o próprio recurso pago, testado, zero linhas afetadas — mas o
  modo de falha é silencioso: no dia em que alguém acrescentar uma policy
  `for all` a essas tabelas (o padrão usado em quase todo o resto do schema), a
  escrita passa a ser permitida sem ninguém decidir. Fechado na **0036**, com
  `revoke` explícito. Aplicada e conferida.
- `notes`, `external_id` e `admin_fee_percent` fora de todo caminho do portal ✅,
  travado por teste — inclusive um que impede o mapper do cliente de voltar a
  espalhar a row, porque copiar-e-apagar é como coluna interna nova chega ao
  portal sem ninguém decidir.
- URL assinada com 60s, travada por teste entre 30 e 300 ✅

**Um erro meu no caminho, que vale registrar:** o primeiro teste de escrita na
trilha reportou "ACEITOU" e eu quase reportei dois furos críticos. `DELETE` e
`UPDATE` sem policy **não dão erro** — afetam zero linhas. Confundi "não errou"
com "conseguiu". Refeito medindo `row_count`, deu o oposto: a RLS barrava tudo.

**O que NÃO ficou pronto: a política de privacidade.**
`docs/runbooks/0037-lgpd-area-do-cliente.md` traz o mapa de dados — o que existe,
onde, quem alcança, por quanto tempo — que é o insumo que um advogado precisa. A
página `app/pages/privacidade.vue` existe e responde na URL, mas **não está
registrada em `STATIC_FOOTER_PAGES`**, então não aparece no rodapé de site
nenhum. Registrar é o ato de publicar, e ele depende de revisão jurídica:
registrar torna a página visível no rodapé de TODA imobiliária por padrão, e
política não revisada no ar no site de um cliente real é pior que nenhuma.

**Retenção da trilha:** proposta de 5 anos após o encerramento do contrato,
alinhada ao prazo de prescrição de reparação civil. É proposta de engenharia, não
parecer — precisa de confirmação.

**Dívida registrada:** não há rotina de expurgo nem de exportação. Hoje as duas
seriam manuais. Aceitável com 10 contratos e nenhum pedido; deixa de ser no dia
em que alguém exercer o art. 18.
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

## Atualização de 2026-09-15: o primeiro contrato real chegou

A imobiliária entregou o material da semana 1 — três PDFs de um contrato real
(imóvel da Rua Cap. Ramão Nunes, Três Lagoas): **laudo de vistoria inicial**,
**contrato de locação** e **contrato de administração**. É o pré-requisito que
sustentava o prazo, e ele fez exatamente o que devia: mudou o desenho antes da
tela existir.

### O achado que muda código: contrato de administração não é "contrato"

O plano previa `contrato` como o documento que as duas pontas assinaram, com
audiência `['inquilino', 'proprietario', 'fiador']`. O terceiro PDF não estava
previsto em lugar nenhum, e é o mais sigiloso dos três: o contrato de
administração é firmado entre a **imobiliária e o proprietário**, e traz

- a taxa de administração — 10% a partir do segundo aluguel, e 100% do primeiro
  a título de intermediação;
- a **conta bancária e a chave Pix pessoais do proprietário**, onde cai o
  repasse;
- a multa rescisória e a comissão de venda devidas à imobiliária.

Subido como `contrato`, ele herdaria o default das duas pontas e **o inquilino
veria a margem da imobiliária e os dados bancários do dono do imóvel**. É o
mesmo vazamento que a 0028 tratou entre boleto e extrato, entrando por uma porta
que ninguém tinha olhado — e a resposta é a mesma: categoria própria, com
audiência decidida em código.

Feito: migration 0032 (`contrato_administracao` no enum),
`defaultAudienceFor` devolvendo `['proprietario']`, rótulo `contrato` renomeado
para "Contrato de locação" (o vocabulário agora tem dois contratos e a tela
precisa distinguir), e teste de rede que falha se qualquer categoria de dono
passar a incluir inquilino ou fiador.

### O que o material revelou e ainda não virou código

Nada aqui bloqueia o demo da semana 2. Tudo aqui bloqueia a semana 4.

1. **O aluguel não é o que o inquilino paga.** O contrato é de R$ 3.000,00 mais
   **11 parcelas de R$ 530,95 de seguro fiança** (Porto Seguro), pagas pelo
   locatário. `contracts.rent_amount` guarda 3.000 — e uma tela que anuncia
   "R$ 3.000,00" para quem paga R$ 3.530,95 durante onze meses vai gerar
   ligação no primeiro mês. Decidir antes da Fase 1: encargo é campo do
   contrato, ou é sempre um documento de pagamento com o valor cheio.
2. **A garantia é seguro fiança, não fiador.** O papel `fiador` existe no enum e
   **não é exercido neste contrato**. Em compensação apareceu um documento que o
   plano não tinha: a **apólice do seguro**. O inquilino paga por ela e vai
   procurá-la no portal. Cabe em `outro` hoje; se repetir na carteira, vira
   categoria.
3. **Dois inquilinos no mesmo contrato.** Giane e Cesar assinam juntos. O schema
   aguenta (duas linhas em `contract_parties` com `role='inquilino'`), mas a
   operação precisa saber: são **duas contas e dois convites**. E o índice
   `(tenant_id, lower(email))` de `portal_users` impede que o casal compartilhe
   um e-mail — se compartilharem, é uma conta só, e a outra pessoa fica sem
   acesso. Perguntar no cadastro, não descobrir no convite.
4. **Nenhum dos três PDFs tem número de contrato.** `contracts.code` é
   `not null` e único por tenant. A imobiliária vai ter que inventar uma
   convenção no primeiro cadastro — melhor combinar antes do card 1.1 do que
   deixar cada contrato nascer com um formato diferente.
5. **Os documentos divergem no endereço, e isso vira requisito de produto.**
   Contrato de locação e contrato de administração dizem *"Rua Capitão Ramão
   Nunes, nº 1359, Jardim Caçula"*; o laudo de vistoria diz *"Rua Cap. Ramão
   Nunes nº 1539, Vila São João, CEP 79621-290"*.

   A primeira leitura foi "a vistoria é de outra casa". Os CPFs dizem que não:
   Thiago (003.590.581-67) é locador nos três, Giane (068.801.178-05) e Cesar
   (368.633.941-20) são locatários na vistoria **e** na locação, e as duas
   testemunhas se repetem. Mesma rua, e 1359 ↔ 1539 é transposição de dígito. É
   o mesmo negócio, com a vistoria saída de um modelo cujo número e bairro não
   foram atualizados.

   **O que importa não é o typo — é que o sistema não teria como saber.** Um
   documento é amarrado a um contrato porque uma pessoa escolheu o contrato num
   select e subiu o PDF. Errou o select, o portal publica o CPF, o endereço e os
   dados bancários de um terceiro para quem não é parte daquele contrato. Com
   upload manual, 10 contratos e vários documentos por mês, isso é questão de
   quando, não de se — e quem descobre é o cliente da cliente. É incidente de
   LGPD, não bug de tela.

   Duas consequências, as duas obrigatórias:

   - **O endereço na tela vem do contrato** (`address_label` / `property_id`),
     nunca transcrito do documento. Com uma fonte só, divergência dentro do PDF
     nunca contradiz o que o portal afirma.
   - **Decisão (15/09): a conferência é humana, e a tela é que precisa ser
     explícita.** Foi considerada uma checagem automática no upload — os três
     PDFs têm camada de texto, dava para procurar o CPF/CNPJ das partes daquele
     contrato e avisar quando nenhum aparecesse. **Não vai ser feita.** O papel
     do produto aqui é dizer com clareza o que vai em cada lugar e quem enxerga
     o quê; classificar documento é ato de quem sobe, e o erro é dela.

     A decisão é coerente com a cadeia da LGPD já registrada neste plano: a
     imobiliária é **controladora** e o imob-ai é **operador**, que trata dado
     sob instrução dela. Subir o documento no contrato errado é instrução
     errada da controladora, não falha do operador.

     O que ela cobra de nós em troca é que a tela não esconda a consequência:

     - `PORTAL_DOC_HINTS` — uma linha por categoria dizendo o que vai ali;
     - `describeAudience()` — "Só o proprietário vê", ao lado da audiência
       selecionada, **derivada de `defaultAudienceFor`** e não escrita à mão,
       para que rótulo e comportamento não possam divergir;
     - o rascunho (`published_at is null`) continua sendo o passo entre subir e
       publicar;
     - `portal_documents.created_by` já registra quem subiu, que é o que
       sustenta "a responsabilidade é de quem classificou" quando alguém
       perguntar.

     O custo aceito, registrado para não ser esquecido: **um documento subido no
     contrato errado será publicado sem um ruído.** Se acontecer uma vez em
     produção, a checagem automática volta à mesa — e o desenho dela está
     descrito acima, pronto.

### O demo não convida terceiro real sem ela mandar

O material veio como **exemplo de formato**, não como "cadastre este contrato".

Primeiro, o que **não** é o problema, para não assombrar ninguém: no demo nenhum
e-mail sai sozinho. O convite que existe (`inviteMember`) usa `generateLink`, que
devolve um link para o admin copiar e não dispara mensagem, e o e-mail
transacional (0.4) está adiado para depois do demo. Uma versão anterior desta
seção dizia que o convite mandaria e-mail para as partes; estava errado.

O problema real é **quem loga**. Para a tela do proprietário existir, alguém
precisa de conta ligada ao contrato com papel `proprietario`. Cadastrar com o
e-mail do Thiago cria uma conta no Auth para uma pessoa real que não combinou
nada disso — e obriga a imobiliária a **entrar como ele** para demonstrar.

**Como o demo roda sem esse problema:** cadastrar o contrato real (o dado é
dela, está no tenant dela, e é isso que dá valor ao demo) e apontar as partes
para o **e-mail da própria imobiliária**. Ela loga como proprietário, vê o
contrato dela e baixa os três documentos — que é exatamente o compromisso
enviado ("você entra num link de teste e baixa o contrato e a vistoria"). Trocar
o e-mail da parte para o do cliente final é uma edição de cadastro, feita no dia
em que ela disser que avisou as pessoas.

Isso também remove a pressa de decidir se este é *o* contrato do demo: qualquer
um dos 10 serve, e a escolha deixa de bloquear a semana 2.

### Decisão (15/09): o demo roda com dado fictício

Substitui a ideia de cadastrar o contrato real dela na semana 2. O e-mail
transacional (0.4) fica para a entrega final — onde o plano já o tinha posto.

**O motivo forte não é o consentimento das partes, é a ordem das fases.** Todo o
endurecimento do caminho de download mora na Fase 3: rate limit, expiração curta
da URL assinada, o teste de que o cliente A não alcança o documento do cliente B,
e o `/security-review`. Tudo isso acontece **depois** do demo. Cadastrar o
contrato real na semana 2 significa pôr CPF, conta bancária e contrato assinado
de três pessoas reais em produção, num caminho que ainda não passou por nenhuma
dessas verificações. Com dado fictício o risco deixa de existir, em vez de ser
administrado.

O que se perde é o impacto de ela ver o próprio contrato na tela. Compensação: o
dado fictício é modelado **sobre o material real** já lido — mesmo vocabulário
("Laudo de Vistoria Inicial", "Contrato de Locação Residencial Mobiliado com
Seguro Fiança"), mesma estrutura de valores (aluguel + parcela de seguro fiança),
mesmas categorias. Parece real porque foi copiado da forma do real; só as
pessoas, o endereço e os números são inventados.

**Os PDFs de demo nascem marcados como demonstração** (cabeçalho ou marca
d'água). Documento que imita contrato assinado e circula sem marca é problema
esperando acontecer — e num demo ninguém precisa que ele seja indistinguível do
real.

**A armadilha, que este repositório já pisou:** a migration 0006 semeou 50
imóveis fictícios no tenant `olmi`, que é cliente real, e a 0010 existe só para
limpar a sujeira — imóveis falsos com nome e WhatsApp inventados ficaram visíveis
no site público do cliente. Aqui o estrago seria menor (portal fechado, bucket
privado, nada aparece no site), mas o contrato de demo apareceria na lista de
contratos dela assim que o painel da Fase 1 existir.

Por isso, duas regras para o fixture:

1. **Marcador de escopo estrito.** Código de contrato com prefixo reservado
   (`DEMO-`), como a 0006 usou `TST-`, para que a remoção alcance exatamente o
   que o demo criou e nada mais.
2. **A remoção é escrita junto com o fixture**, não depois — incluindo os
   objetos no bucket `portal-docs`, que a 0010 não precisou tratar e aqui são
   metade do dado. Dado de demo em tenant real sem caminho de volta pronto é
   como a 0010 nasceu.

**Quando construir:** o fixture só faz sentido junto com as telas da Fase 2
(login, "meus contratos", documentos). Não há o que semear antes de existir tela
que o mostre.

**Consequência para a condição de prazo:** a exigência de "um contrato real com
os PDFs correspondentes na semana 1" era por dois motivos — modelar o domínio e
alimentar o demo. **O primeiro já foi cumprido** pelos três PDFs lidos (e rendeu
a categoria `contrato_administracao`, o seguro fiança fora do `rent_amount` e o
resto desta seção). O segundo deixa de existir. O material que ainda falta
continua sendo necessário para **modelar** as telas da semana 4, e não bloqueia
mais o demo da semana 2.

### O que ainda falta ela mandar

O material cobre a área do **proprietário** — que é exatamente o marco da
semana 2, e por isso ele não está bloqueado. Faltam os dois documentos do lado
do dinheiro, que são o marco da semana 4:

- **Comprovante de pagamento do aluguel** (hoje Pix, categoria `recibo`) — é o
  que o inquilino abre o portal para ver.
- **Extrato de repasse ao proprietário** (categoria `extrato`) — e este é o mais
  urgente dos dois, porque provavelmente **ainda não existe como documento**. É
  por ele que a taxa de administração chega legitimamente ao dono do imóvel. Se
  hoje o repasse é um comprovante de transferência solto, isso é decisão de
  produto: ou a imobiliária passa a emitir um extrato, ou o portal gera um.
- Útil, não bloqueante: a **apólice do seguro fiança** citada no contrato.
