# WhatsApp (Cloud API) — colocar no ar e conectar uma imobiliária

Recurso: Conversas do WhatsApp (0059). Spec:
`docs/superpowers/specs/2026-09-29-conversas-whatsapp-design.md`.

O caminho crítico é a Meta, não o código: a verificação da empresa leva de
dias a ~2 semanas. Comece por ela.

## 1. Uma vez, para a plataforma

1. **Verificar a empresa Moradi** no Meta Business Manager (Configurações do
   negócio → Central de segurança → Verificação). CNPJ, domínio verificado e
   site com política de privacidade.
2. **Criar o app** em developers.facebook.com → tipo *Business* → adicionar o
   produto **WhatsApp**.
3. **Variáveis na Vercel** (produção e preview), com o prefixo `NUXT_`:
   - `NUXT_WHATSAPP_APP_SECRET` — App → Configurações → Básico → Chave secreta;
   - `NUXT_WHATSAPP_VERIFY_TOKEN` — qualquer texto longo (`openssl rand -hex 24`).
   Redeploy depois de criar.
4. **Webhook do app** (WhatsApp → Configuração):
   - URL de callback: `https://<painel>/api/webhooks/whatsapp` (a tela de
     conexão no painel mostra o endereço exato, com botão de copiar);
   - token de verificação: o mesmo de `NUXT_WHATSAPP_VERIFY_TOKEN`;
   - campos assinados: **`messages`** e **`smb_message_echoes`** (o segundo é
     o que registra as respostas dadas pelo celular no Coexistence).
5. **Tech Provider + App Review** das permissões `whatsapp_business_messaging`
   e `whatsapp_business_management`. Destrava o Embedded Signup (F1). Os vídeos
   do review podem ser gravados com o número de teste do próprio app.

## 2. Ligar para a imobiliária

```sql
insert into public.tenant_features (tenant_id, feature, enabled)
values ('<tenant_id>', 'whatsapp', true)
on conflict (tenant_id, feature) do update set enabled = true;
```

Develop e produção dividem o banco: ligue só para a imobiliária da demo até o
recurso estar vendido.

## 3. Conectar o número pelo popup (Embedded Signup)

Depende do Tech Provider aprovado (passo 1.5). Uma vez, no app da Meta:

1. **Facebook Login for Business → Configurações → Criar configuração**, do
   tipo *WhatsApp Embedded Signup*, com as permissões
   `whatsapp_business_management` e `whatsapp_business_messaging`. O id dela é
   o `NUXT_PUBLIC_WHATSAPP_CONFIG_ID`; o id do app é o
   `NUXT_PUBLIC_WHATSAPP_APP_ID`. Redeploy.
2. **Domínios permitidos para o SDK de JavaScript** (Facebook Login →
   Configurações): cada endereço de PAINEL, com https. ⚠️ É por host, sem
   curinga: painel em domínio próprio de imobiliária precisa entrar na lista,
   senão o popup abre e fecha com "domínio não permitido".

No painel, como **owner**: Conversas → "Conectar com o Facebook".

- **Número do app WhatsApp Business** (Coexistence, recomendado): a pessoa lê
  um QR no app do celular durante o popup. Nada muda para quem usa o celular.
- **Número novo**: a tela pede um PIN de 6 dígitos (verificação em duas
  etapas), e o servidor registra o número na Cloud API.

O servidor troca o `code` pelo token (com o App Secret), confere que o número
está na WABA autorizada, assina o webhook e grava o token cifrado. Erros nos
logs: `whatsapp.embedded_signup_recusado` (a Meta recusou, a frase dela vai
para a tela) e `whatsapp.embedded_signup_numero_fora_da_waba` (ids que não
batem — se repetir, investigar).

O histórico de 6 meses do Coexistence NÃO é importado (decisão de LGPD na spec).

## 3b. Conectar o número à mão (suporte)

Pré-requisitos da imobiliária: número no **WhatsApp Business** há 7+ dias (para
o Coexistence), Business Manager próprio e **cartão cadastrado na WABA** — a
conta da Meta é dela, e ela paga a Meta direto.

1. No Business Manager DELA: WhatsApp → adicionar o número (no Coexistence,
   escolher "usar o número que já está no app WhatsApp Business" e ler o QR).
2. Criar um **usuário do sistema** com acesso ao app e à WABA, e gerar um
   token permanente com `whatsapp_business_messaging` e
   `whatsapp_business_management`.
3. No painel da Moradi, como **owner**: Conversas → colar a identificação do
   número, a da conta do WhatsApp Business e o token. O servidor confere na
   Meta, assina o app na WABA e guarda o token cifrado.

Para testar sem cliente: o **número de teste** do app (WhatsApp → Configuração
da API) funciona com até 5 destinatários cadastrados, na hora.

## 4. Modelos de mensagem

Fora das 24h, e para começar a conversa com quem veio pelo formulário, só com
modelo aprovado. Em Conversas, numa conversa com a janela fechada → "Enviar
modelo" → **Criar modelos sugeridos** (só o owner). A Meta analisa em minutos
ou horas; até lá eles aparecem como "Em análise na Meta".

Modelos criados direto no painel da Meta também aparecem, desde que tenham
variáveis só no corpo.

## 5. Mídia

Precisa da migration **0060** (colunas `media_*` e o bucket privado
`whatsapp-media`). Foto, áudio, vídeo, figurinha e documento de até 16 MB
aparecem na conversa. O webhook tenta baixar em até 8s; o que não couber é
baixado na primeira vez que a bolha aparece na tela.

- `whatsapp.midia_nao_baixada` nos logs: a Meta demorou ou recusou; o painel
  tenta de novo ao abrir.
- `whatsapp.midia_formato_fora_da_lista`: chegou um tipo que o bucket não
  aceita. Se for legítimo, entra em `WHATSAPP_MIDIA_MIMES` e na 0060 juntos
  (o teste confere que batem).

Envio pelo painel: o clipe na conversa aberta. A Meta busca o arquivo por
uma URL assinada de 1h do nosso bucket. `whatsapp.upload_url_falhou` nos logs =
o Storage recusou gerar a URL de upload (bucket ausente: aplicar a 0060).

## 6. Conferir

- Mande uma mensagem para o número: ela aparece em Conversas, e um contato novo
  aparece no funil com o imóvel (se a mensagem veio do botão do site).
- Responda pelo painel e pelo celular: as duas aparecem, e "Primeira resposta"
  é preenchida.
- `logWarn whatsapp.webhook_recusado` nos logs = App Secret errado.
  `whatsapp.webhook_numero_desconhecido` = número não conectado (ou de outro app).

## Custos (conferir no rate card antes de fechar preço)

Cobrança por mensagem desde 07/2025. No Brasil, marketing ~US$0,0625 e utility
~US$0,0068. Resposta dentro da janela de 24h: conferir a mudança anunciada para
01/10/2026. Mensagem enviada pelo app no Coexistence não é cobrada.
