# Aviso de lead por e-mail — design

## Motivo

Em 09/09/2026 chegou um lead pelo site da OLMI e ninguém retornou. O
`POST /api/leads` gravava o contato e não avisava ninguém: o lead só existia
para quem abrisse o painel. É o "funil invisível" que a 0016 quis atacar, só
que agora dentro do próprio sistema.

## Escopo

1. **Aviso imediato.** Todo lead que chega pelo formulário público gera um
   e-mail para a imobiliária com nome, telefone, interesse, imóvel, mensagem, um
   botão "Responder no WhatsApp" (`wa.me` com a primeira frase pronta) e o link
   para o quadro de leads.
2. **Lembrete diário.** Às 9h (Brasília), um e-mail por imobiliária com os leads
   que continuam em `novo` e sem alteração nenhuma há mais de 20h, recebidos
   nos últimos 7 dias.

Destinatários: membros do painel com e-mail confirmado + `tenants.email`, sem
repetição, um e-mail por endereço.

## Fora do escopo, por decisão

- **Push do app instalado.** Exige trocar o service worker de `generateSW` para
  `injectManifest`, uma tabela de inscrições, chaves VAPID e a tela de
  permissão. É outro PR, e mexe no SW que acabou de ganhar o fluxo de
  atualização (PR #52).
- **Aviso por WhatsApp (API oficial da Meta).** Custa centavos por mensagem, mas
  depende de verificar a empresa na Meta e aprovar o template. Próximo passo.
- **Registrar o clique no botão de WhatsApp.** O `wa.me` não devolve quem clicou;
  vira um tipo de evento separado, com sua própria spec.
- **Escolher quem recebe (por membro, por corretor).** `brokers` não tem e-mail
  nem login (ver CLAUDE.md, "Papéis"). Distribuir por corretor pede esse
  vínculo primeiro.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `await` do aviso no POST, com teto de 4s | `event.waitUntil` | O preset `vercel` do Nitro 2.13 não repassa o `waitUntil` à plataforma; a função congelaria e o aviso sumiria sem log. |
| Aviso nunca lança | Deixar o erro subir | O lead já está gravado; um 500 faria o visitante desistir ou duplicar. O lembrete diário cobre o aviso perdido. |
| Remetente "Moradi" pelo domínio da plataforma | Remetente dedicado do tenant | É aviso interno, não fala com o cliente final; o remetente dedicado existe para o cliente final reconhecer a imobiliária. |
| Destinatários por `getUserById` um a um | `listUsers()` como em `listMembers` | `listUsers` devolve só a primeira página (50); membro da página 2 perderia o aviso em silêncio. |
| Convite pendente não recebe | Todo membro | O e-mail carrega PII de terceiro, e ninguém provou ser dono de um endereço só digitado. |
| "Parado" = `stage = novo` **e** `updated_at` antigo | Só a etapa | Anotar "liguei, não atendeu" já é atendimento; só a etapa cobraria esse lead todo dia. |
| Janela de 20h, não 24h | 24h | O cron roda uma vez por dia: com 24h, o lead das 9h05 de ontem escaparia por minutos. |
| Cauda de 7 dias | Sem limite | Cobrar para sempre um lead abandonado de propósito ensina a ignorar o lembrete. |
| Cron diário da Vercel, `CRON_SECRET` obrigatório | Cron horário / rota aberta | O plano Hobby só aceita cron diário; sem o segredo a rota seria um disparador público de e-mail. |
| Sem migration | Coluna `lembrete_enviado_em` | O próprio `updated_at` e a janela dão o comportamento; uma coluna nova seria estado a mais para manter. |

## Operação

- Configurar `CRON_SECRET` na Vercel (produção). Sem ele a rota responde 503 e
  registra `cron.segredo_ausente`.
- `MAIL_API_KEY`/`MAIL_FROM` já existem (portal). Sem eles, em produção, o aviso
  registra `lead_aviso.envio_falhou`; o lead continua gravado.
- Imobiliária sem destinatário registra `lead_aviso.sem_destinatario`: resolve
  cadastrando o e-mail em Configurações.
