# Clique no WhatsApp no painel — design

## Motivo

Metade do contato de um site de imobiliária sai pelo botão de WhatsApp, e esse
contato nunca virava dado: o `wa.me` abre o app e o sistema não fica sabendo
de nada. É o "funil invisível" que a 0016 já citava. O aviso por e-mail
(2026-09-25-aviso-de-lead-design.md) resolveu o formulário; o WhatsApp
continuava cego.

O clique **não diz quem clicou** — o `wa.me` não devolve nada. O que dá para
registrar é "alguém abriu o WhatsApp a partir do imóvel X, às 14:32, e a
conversa foi para o número do corretor Y". Com isso, quem atende casa a
mensagem que chegou com o imóvel de onde ela veio, e transforma em lead.

## Escopo

1. **Registro do clique.** O ouvinte único de clique em `wa.me` que já existe
   (`app/plugins/observabilidade.client.ts`) passa a mandar um `sendBeacon`
   para `POST /api/whatsapp-clicks`, com o código do imóvel (quando o link é de
   um imóvel) e a origem na página. O servidor resolve o imóvel e para qual
   número a conversa foi (corretor captador ativo com telefone, ou a
   imobiliária) — a mesma regra de `publicBrokerPhone`, que é a que monta o link.
2. **Lista à parte no painel.** Seção "Cliques no WhatsApp" na página de
   contatos, últimos 7 dias: imóvel, horário, para quem foi.
3. **Virar lead.** Botão que abre o cadastro manual já com o imóvel, o corretor
   e o tipo preenchidos. Ao salvar, o clique fica marcado com o lead criado.
4. **Retenção.** O cron diário apaga cliques com mais de 90 dias.

## Fora do escopo, por decisão

- **Card no quadro para cada clique.** Muito clique não vira mensagem; cards
  sem nome nem telefone virariam lixo que alguém arquiva à mão, e o quadro
  deixaria de ser a lista de gente para atender.
- **Origem `whatsapp` em `leads.source`.** Exigiria recriar `leads_source_check`,
  e o README das migrations registra que esta pasta diverge do banco. O lead
  criado a partir do clique entra como `manual`; o vínculo mora em
  `whatsapp_clicks.lead_id`. A métrica por origem pode vir depois, com o banco
  lido antes.
- **Aviso por e-mail a cada clique.** Seria um e-mail por curiosidade, sem nada
  para responder.
- **Descobrir quem clicou** (API oficial com o número da imobiliária). É o
  passo 4 do estudo, com custo e onboarding na Meta.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Lista à parte | Card no quadro | Decisão do dono do produto: o quadro fica só com quem tem nome e telefone. |
| `sendBeacon` | `fetch` | O link abre o app ou outra aba; um `fetch` em voo é cancelado quando a página perde o foco ou é descarregada. |
| Destino calculado no servidor | O navegador informar | É dado que o painel mostra ao cliente; vindo do body, seria o visitante quem escreve. |
| Origem por lista fechada (`imovel`, `card`, `barra_fixa`, `site`) | Guardar o caminho da página | Mesmo motivo de `leads.source`: endpoint público e métrica mostrada ao cliente. O caminho também diria qual imóvel a pessoa olhava sem necessidade. |
| Repetição do mesmo IP no mesmo imóvel em 30 min é descartada | Gravar todo clique | Quem toca duas vezes no botão não é duas pessoas; a lista inflaria. |
| Mais de 20 cliques do mesmo IP em 10 min são descartados em silêncio | Responder 429 | O beacon não lê resposta; o 429 só serviria para dizer ao abusador que foi pego. |
| Sem IP identificável (sem `RATE_LIMIT_IP_SALT`), grava sem deduplicar | Não gravar | O clique é o dado; a deduplicação é melhoria. O log de sal ausente já grita. |
| Resposta sempre 204 | Erros de validação | Nada que o visitante faça depende da resposta, e ela não deve servir para sondar códigos de imóvel. |
| Conversão pelo `whatsappClickId`, com o imóvel lido do clique no servidor | Aceitar `propertyId` no cadastro manual | `propertyId` do body é id de outro tenant esperando para ser gravado; o id do clique passa pela RLS do membro. |
| Membro só atualiza `lead_id` (grant por coluna) | Só a policy de update | A policy escolhe linhas, não colunas; com o GRANT default, o membro reescreveria `property_id` pela API REST antes de converter. |
| Marcação condicional (`lead_id is null`) e o contato do perdedor é desfeito | Só a checagem antes do insert | Entre ler e gravar, dois atendentes passariam pela checagem e o quadro ganharia o mesmo contato duas vezes. |
| 90 dias de retenção | Para sempre | `ip_hash` é pseudônimo de visitante; guardar sem prazo é guardar sem motivo. |

## Tabela

`whatsapp_clicks` (migration 0046): `tenant_id`, `property_id`, `broker_id`,
`destination`, `origin`, `ip_hash`, `lead_id`, `created_at`. RLS ligada; o
membro lê as do próprio tenant e atualiza só a coluna `lead_id` (grant por
coluna, para marcar a conversão); anon
sem nada; a escrita pública é do servidor, por `serviceSupabase()`, depois de
validar — o padrão da 0015.
