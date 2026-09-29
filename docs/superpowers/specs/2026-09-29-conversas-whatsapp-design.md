# Conversas do WhatsApp no painel — design

**Data:** 2026-09-29
**Motivo:** metade do contato de um site de imobiliária sai pelo WhatsApp, e
hoje o sistema só sabe que alguém *clicou* (2026-09-25-clique-whatsapp-design.md).
A conversa acontece no celular do corretor: quando ele sai da imobiliária, leva
os clientes e o histórico; o dono não sabe quanto tempo o lead esperou. É a dor
mais citada pelas imobiliárias de 2 a 15 corretores, e a Imobzi (R$69/número) e
o Imoview já vendem isso. Sem ela, a demonstração perde para os dois.

A pesquisa de mercado, de integração e de UX que embasa este documento está
resumida na seção 6.

---

## 1. O que entra (F0 + F1 núcleo)

1. **Conectar um número** da imobiliária pela API oficial (Cloud API da Meta),
   em Configurações → Conversas: `phone_number_id`, `waba_id` e o token do
   usuário de sistema. O servidor confere o token na Meta, assina o app na
   WABA e guarda o token cifrado (`cofre.ts`).
2. **Webhook único** `/api/webhooks/whatsapp` que recebe mensagens, ecos
   (mensagem que o corretor mandou pelo app no modo Coexistence) e status de
   entrega, de todos os tenants.
3. **Lead nasce sozinho.** A primeira mensagem de um número que ainda não é
   lead cria o lead (`stage = novo`), passa pela roleta quando o CRM está
   ligado e dispara o aviso por e-mail que já existe. Número que já é lead se
   liga ao lead existente.
4. **Imóvel e clique.** O texto pré-preenchido do `wa.me` já traz o código
   ("Tenho interesse no imóvel VD-0010"). A primeira mensagem casa com o
   imóvel e com o clique mais recente dele ainda sem lead.
5. **Caixa de entrada** `/admin/conversas`: lista (Todas · Sem resposta · Não
   lidas), conversa, painel do lead e do imóvel. Tempo real pelo Supabase
   Realtime, com a mesma recaída para recarga que o quadro de leads já usa.
6. **Responder** pelo painel, dentro da janela de 24h. Fora dela o campo
   trava e explica por quê.
7. **Tempo de primeira resposta** por conversa (`first_response_at`), que é o
   número que o dono pede.
8. **Retenção:** conversa sem lead some em 90 dias, como o clique.

Tudo atrás de `tenant_features.feature = 'whatsapp'`.

## 2. Fora do escopo, por decisão

- **Embedded Signup** (o popup "Conectar com o Facebook"). Depende de a Moradi
  ser Tech Provider aprovada na Meta, que é espera externa de dias a semanas.
  Até lá a conexão é manual (item 1), feita por nós no onboarding. O adaptador
  (`server/services/whatsapp/provider.ts`) já isola a troca.
- **Modelos de mensagem (templates)** para falar fora da janela de 24h.
  Exigem aprovação da Meta por modelo; entram na F2 com os dois modelos
  ("novo lead" e "retomar conversa").
- **Mídia.** Foto e áudio chegam como mensagem com o tipo ("Foto", em itálico), sem o
  arquivo. Baixar exige o token e uma função que caiba no tempo da Vercel;
  entra junto com o bucket privado na F2.
- **Histórico importado do Coexistence** (até 6 meses). Traz conversa pessoal
  de quem não é lead, e isso precisa de decisão de LGPD com o cliente antes.
- **Origem `whatsapp` em `leads.source`.** Mesmo motivo da spec do clique: a
  constraint teria de ser recriada, e esta pasta de migrations diverge do
  banco. O lead entra como `outro`; o vínculo é
  `whatsapp_conversations.lead_id`.
- **API não oficial** (Evolution, Z-API, Baileys), nem como ponte. Viola os
  termos do WhatsApp e a Meta está banindo números no Brasil em 2026; o
  número banido é o principal canal de vendas do cliente. Além disso exige um
  processo sempre ligado com websocket, que a Vercel não tem.
- **"Minhas conversas".** Corretor não loga (CLAUDE.md, "Papéis"). O filtro
  por corretor usa o `broker_id` do lead.

## 3. Regras de negócio

1. **O tenant sai do `phone_number_id`, nunca do Host nem do corpo sem
   prova.** O webhook é um só para a plataforma; a assinatura
   `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com o App Secret) prova que
   o corpo veio da Meta, e o `phone_number_id` desse corpo é procurado em
   `whatsapp_accounts`. Número desconhecido é ignorado com 200.
2. **Idempotência pelo `wamid`.** A Meta reenvia. `unique (tenant_id, wamid)`
   e o insert que colide é ignorado — e só a mensagem NOVA cria lead, conta
   não lida e dispara aviso.
3. **Status nunca regride.** `lida` que chega antes de `entregue` (acontece)
   não volta a `entregue`.
4. **Janela de 24h:** texto livre só se `last_inbound_at` tiver menos de 24h.
   É regra da Meta; a API recusaria de qualquer forma, e travar antes evita a
   pessoa escrever uma resposta longa que não sai.
5. **Primeira resposta** é a primeira mensagem de saída depois de uma entrada,
   pelo painel OU pelo app (eco). Contar só o painel puniria quem responde do
   celular — que no Coexistence é o normal.
6. **Telefone do lead:** o `wa_id` brasileiro às vezes vem sem o nono dígito
   (`556791234567`). O casamento com lead existente tenta as duas formas; o
   lead novo é gravado com o nono dígito, no formato do formulário (sem DDI).
7. **Respostas do webhook:** 401 para assinatura errada, 200 para tudo que foi
   entendido (inclusive repetido ou ignorado), 500 só quando a gravação
   falhou — a Meta reenvia, e é o que queremos.

## 4. Tabelas (migration 0059)

- `whatsapp_accounts` — número conectado. Token cifrado. **Membro não lê** a
  tabela (o painel recebe só os campos seguros pela API): o token cifrado não
  tem por que sair do servidor.
- `whatsapp_conversations` — uma por (número conectado, contato). Guarda o
  vínculo com lead, imóvel e clique, a janela e os contadores.
- `whatsapp_messages` — append-only, exceto o `status` de entrega.

Membro lê conversa e mensagem (é o que o Realtime precisa, com RLS); ninguém
escreve pelo papel `authenticated` — toda escrita é do servidor, depois de
`requireTenantMember` + recurso ligado (invariante nº 4). Anon sem nada.

## 5. Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Cloud API oficial, atrás de adaptador | BSP (360dialog, Twilio) direto | Sem mensalidade por número nem markup; o adaptador deixa a 360dialog entrar como ponte se o app review da Meta atrasar. |
| Cloud API oficial | Evolution/Z-API/Baileys | Banimento do número do cliente e processo long-running que a Vercel não roda. |
| Conexão manual no F0 | Esperar o Embedded Signup | A espera da Meta é externa e de semanas; a venda é agora. |
| Coexistence (ecos contados) | Só API | O corretor não larga o app do celular; é a objeção que derruba a venda. |
| Tenant pelo `phone_number_id` | Um webhook por tenant na URL | A Meta aceita UM callback por app; o `phone_number_id` vem assinado. |
| Escrita só pelo servidor | Policy de insert para membro | Mensagem de saída sem passar pela Meta seria histórico falso — "respondi" sem ter respondido. |
| Membro não lê `whatsapp_accounts` | Grant por coluna sem o token | Menos superfície: nada do painel precisa da linha crua. |
| Lead como `outro` | Nova origem `whatsapp` | Constraint recriada contra um banco que diverge da pasta. |
| Realtime + recarga de 20s quando cai | Só polling | O quadro de leads já usa Realtime com RLS; conversa sem tempo real parece quebrada. |
| Mídia fora do F0 | Baixar no webhook | Download com token dentro do tempo da Vercel, com retentativa, é uma entrega por si. |
| 90 dias para conversa sem lead | Guardar sempre | Conteúdo de conversa é dado pessoal; sem lead não há atendimento que justifique. |

## 6. Pesquisa (resumo)

- **Mercado:** Imoview (API oficial, sem taxa extra), Imobzi (R$69/número +
  R$19/usuário), Jetimob e Kenlo apostando em "IA SDR". O que vende para
  imobiliária pequena: número da imobiliária e não do corretor, tempo de
  primeira resposta visível ao dono, conversa ligada ao imóvel, corretor
  continuando no celular.
- **Preço sugerido:** add-on "Moradi Conversas" R$99–129/mês por número, ou 1
  número incluso no plano Imobiliária. A imobiliária paga a Meta direto na WABA
  dela — a Moradi não banca conta de ninguém.
- **Custo Meta (conferir no rate card antes de fechar preço):** por mensagem
  desde 07/2025; marketing ~US$0,0625 e utility ~US$0,0068 no Brasil. Há
  indicação de que a resposta de serviço passa a ser cobrada a partir de
  01/10/2026; mensagem enviada pelo app no Coexistence não é cobrada.
- **UX:** três colunas no computador (lista · conversa · lead), lista →
  conversa em tela cheia no celular com link direto; selo de "sem resposta" com
  texto, não só cor; contagem anunciada como frase; campo travado fora da
  janela com explicação; estado vazio que leva a "Conectar número".

## 7. Caminho crítico (fora do código)

1. Verificação da empresa Moradi no Meta Business Manager.
2. App Meta (Business) com o produto WhatsApp; webhook apontando para
   `https://<painel>/api/webhooks/whatsapp`, campos `messages` e
   `smb_message_echoes`.
3. Pedido de Tech Provider + App Review (`whatsapp_business_messaging`,
   `whatsapp_business_management`) — destrava o Embedded Signup.
4. Variáveis: `NUXT_WHATSAPP_APP_SECRET`, `NUXT_WHATSAPP_VERIFY_TOKEN`
   (e `NUXT_PAYMENTS_ENCRYPTION_KEY`, já existente, cifra o token).
