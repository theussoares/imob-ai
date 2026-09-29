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
9. **Modelos de mensagem** (entrou em 29/09, logo depois do F0):
   - lista dos modelos da conta da Meta da imobiliária, com o status de lá;
   - envio de modelo aprovado numa conversa fora da janela de 24h;
   - **começar a conversa** com um contato do formulário que nunca escreveu,
     pela gaveta do contato — o atendimento nasce no painel, e não no
     celular de quem clicou no `wa.me`;
   - botão "Criar modelos sugeridos": dois modelos em português
     (`moradi_primeiro_contato`, utilidade; `moradi_retomar_conversa`,
     marketing) enviados para análise da Meta.
10. **Mídia recebida** (0060): foto, áudio, vídeo, figurinha e documento de
    até 16 MB, do cliente e dos ecos do celular.
    - O webhook baixa dentro de um prazo de 8s, DEPOIS de gravar todas as
      mensagens; o que não couber fica `pendente` e o painel baixa na primeira
      vez que a bolha aparece na tela.
    - Bucket privado `whatsapp-media`, pasta por tenant; o membro lê por URL
      assinada de 10 min, assinada com o client dele (policy confere a pasta).
    - O token só vai para host da Meta (`urlDaMeta`); o nome do arquivo do
      cliente nunca entra no caminho do objeto.
    - A retenção apaga os arquivos ANTES das linhas, pela pasta da conversa.
11. **Envio de arquivo pelo painel**: foto (JPG/PNG até 5 MB), vídeo MP4,
    áudio MP3/M4A/AAC/AMR, PDF e Office até 16 MB, com legenda.
    - O navegador sobe DIRETO no bucket com URL de upload de uso único; o
      servidor escolhe o caminho (`<tenant>/<conversa>/out-<uuid>.<ext>`).
    - O servidor confere o caminho contra a pasta de envio da conversa, lê
      tipo e tamanho do objeto no Storage e manda pela Meta **por link**
      (URL assinada de 1h). Se a Meta recusar, o arquivo sai do bucket.
12. **Embedded Signup** — "Conectar com o Facebook" em Conversas (owner).
    - Coexistence (número do app WhatsApp Business) ou número novo com PIN.
    - O SDK da Meta só carrega no clique; o `code` é trocado no servidor com o
      App Secret; o número é conferido contra a WABA que o token enxerga.
    - Só o painel ganha `COOP: same-origin-allow-popups` e a CSP com a Meta; o
      site público continua igual (o guardrail de privacidade confere).
    - A conexão manual continua, recolhida, para o suporte.
14. **Gravar áudio pelo microfone** na conversa aberta.
    - Formato por navegador, só o que a Meta aceita: ogg/opus (Firefox) ou
      mp4 com AAC explícito (Chrome 126+, Edge, Safari). Conferido no Chrome
      152: o arquivo sai `ftypisom` com trilha `mp4a`.
    - Ouve antes de mandar (vira o mesmo anexo do clipe), teto de 5 minutos,
      microfone solto ao terminar ou cancelar.
    - `Permissions-Policy: microphone=(self)` só no painel; o site segue `()`.
    - `audio/ogg` entra no envio só pela gravação — no seletor de arquivo não,
      porque um .ogg qualquer pode ser vorbis, que a Meta recusa.
13. **Histórico do Coexistence** (0061): até 6 meses de conversas do app.
    - Só nas 24h depois da conexão (regra da Meta), só o owner, com o texto do
      aceite gravado antes do pedido; o webhook descarta histórico sem pedido.
    - `so_leads` (padrão): só telefones que já eram lead ANTES da conexão, em
      qualquer etapa — um lead criado depois pelo formulário público (que aceita
      qualquer telefone) faria uma conversa pessoal passar pelo filtro.
      `tudo`: todas, com a retenção de 90 dias da conversa sem lead.
    - Não cria lead, não conta não lida, não é "primeira resposta", não avisa.
    - Mídia antiga fica `pendente` e baixa se alguém abrir.
    - A agenda do app (`smb_app_state_sync`) só dá nome a conversa existente.

Tudo atrás de `tenant_features.feature = 'whatsapp'`.

## 2. Fora do escopo, por decisão

- **Criar lead a partir do histórico.** Seis meses de agenda do celular
  virariam card no funil e e-mail para o corretor — lista de prospecção feita
  com conversa pessoal.
- **Modelos com imagem no cabeçalho ou link variável em botão.** Pedem
  parâmetros que a tela ainda não coleta; aparecem na lista como "tipo ainda
  não suportado", sem botão de enviar — a Meta recusaria o envio sem eles.
- **Criar modelo livre pelo painel.** Só os dois sugeridos. Modelo escrito à
  mão é recusado com frequência pela Meta, e a recusa chega sem explicação
  útil; quem precisa de outro cria no painel da Meta, e ele aparece aqui.
- **Converter WebM no navegador.** O navegador que só grava WebM fica sem o
  botão de gravar (anexar mp3/m4a continua). Converter exigiria um codificador
  de áudio no bundle do painel para um caso que, em 2026, é raro: Chrome 126+,
  Edge e Safari gravam mp4/AAC, e o Firefox grava ogg/opus.
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
| Modelo relido na Meta a cada envio | Confiar no corpo que o navegador mostrou | O histórico grava o que o cliente leu; e a Meta pausa ou recusa modelo sem avisar. |
| Número do contato sai do lead | Aceitar o número no body | Número do body = mensagem em nome da imobiliária para quem o membro quisesse. |
| Conversa criada com o `wa_id` que a Meta devolve no envio | O número do formulário | A resposta chega pelo `wa_id` resolvido (nono dígito); com o outro, a mesma pessoa teria duas conversas. |
| Categorias honestas nos sugeridos | Tudo como utilidade (mais barato) | A Meta reclassifica e cobra; e um modelo "utilidade" que é marketing derruba a qualidade do número. |
| Baixar a mídia no servidor e guardar | Mostrar direto da Meta | O endereço da Meta expira em minutos e exige o token, que não pode ir ao navegador. |
| Webhook com prazo + download na primeira visualização | Só no webhook / só sob demanda | Só no webhook perde a foto quando a Meta demora; só sob demanda perde a de quem ninguém abriu a tempo. |
| Teto de 16 MB | Guardar tudo (documento vai a 100 MB) | É o teto de vídeo e áudio do próprio WhatsApp; PDF gigante fica "abra no celular". |
| Upload direto no bucket + envio por link | Arquivo pelo corpo da função | A Vercel recusa corpo acima de 4,5 MB; um vídeo de 12 MB nem chegaria ao código. |
| Caminho escolhido pelo servidor, conferido no envio | Navegador escolhe | Caminho do body apontando para o arquivo de outro cliente sairia pelo WhatsApp para outra pessoa. |
| Membro sem policy de escrita no bucket | Policy de insert na própria pasta | Ele escreveria por cima de um arquivo recebido — o histórico deixaria de ser prova. |
| Retenção pela pasta, não pela coluna | Só `media_path` | A pasta pega o upload que nunca virou mensagem. |
| Número conferido contra a WABA do token | Confiar nos ids do popup | Os ids passam pelo navegador; trocados, prenderiam o número de outro cliente da Meta. |
| COOP e CSP afrouxados só em `/admin/**` | Afrouxar no site todo | O visitante nunca carrega a Meta; o afrouxamento só tem motivo onde o popup abre. |
| SDK carregado no clique, `cookie: false` | Carregar ao abrir Conversas | Script da Meta em toda visita, de quem nunca vai conectar nada. |
| Histórico só com aceite do owner, padrão `so_leads` | Importar tudo ao conectar | O histórico traz conversa pessoal; quem decide é a controladora, e o padrão é o mais estreito. |
| Aceite = o texto exato, gravado com quem e quando | Um booleano | Um `true` não diz o que foi aceito, nem serve de registro se um titular perguntar. |
| Histórico não cria lead nem avisa | Tratar como mensagem nova | Seria transformar a agenda do celular em lista de prospecção. |
| Sem cache da lista de modelos | Fila (Vercel Queue, pg_cron) | Com o download sob demanda, nada se perde sem fila; fila seria infraestrutura nova para um ganho pequeno. |
| Sem cache da lista de modelos | Cache de minutos | O status muda na Meta, e a tela tem que dizer a verdade na hora do envio. |

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
   `whatsapp_business_management`) — destrava o Embedded Signup (item 12).
   Criar a configuração do Embedded Signup e liberar os domínios do painel.
4. Variáveis: `NUXT_WHATSAPP_APP_SECRET`, `NUXT_WHATSAPP_VERIFY_TOKEN`,
   `NUXT_PUBLIC_WHATSAPP_APP_ID`, `NUXT_PUBLIC_WHATSAPP_CONFIG_ID`
   (e `NUXT_PAYMENTS_ENCRYPTION_KEY`, já existente, cifra o token).
