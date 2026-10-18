# E-mail transacional — escolher provedor, verificar domínio, ligar

Runbook do card 0.4. Cobre a escolha do provedor, o que cada registro de DNS
faz, e como conferir que funcionou.

## O que este card entrega

Dois e-mails saem do sistema:

| E-mail | Quando | Quem envia |
|---|---|---|
| Convite do portal | a imobiliária cadastra um cliente | **nós** (card 1.2) |
| Redefinir senha | o cliente clica em "esqueci minha senha" | **nós** (`/api/portal/recuperar-senha`) |

**Os dois saem pelo nosso mailer, não pelo Supabase.** Isso não é preferência:
o SMTP customizado do Supabase tem **um remetente global por projeto** — um nome
de exibição e um endereço, iguais para todos os tenants. A decisão registrada no
plano é que o cliente final veja o nome da imobiliária **dele** na caixa de
entrada e responda para ela. Num remetente global isso é impossível.

Por isso o código usa `generateLink` (que gera o link e **não envia nada**) e
manda pelo `server/utils/mailer.ts`, com `From: <nome da imobiliária>
<nao-responda@dominio-da-imobiliaria>` (ou `@usemoradi.com.br`, quando ela não
tem domínio próprio — ver abaixo) e `Reply-To: <e-mail da imobiliária>`.

> Consequência prática: **não é preciso configurar Custom SMTP no Supabase**
> para esta feature. Se um dia outro fluxo de auth do Supabase precisar enviar
> (confirmação de e-mail, magic link), aí sim configura-se lá — com o remetente
> genérico da plataforma, ciente de que ele não leva a marca do tenant.

## Escolha do provedor

O volume aqui é pequeno: 10 contratos, convites uma vez por pessoa, mais
recuperações esporádicas. Dezenas de e-mails por mês.

| Provedor | Gratuito | Pega no quê |
|---|---|---|
| **Resend** | 3.000/mês, **100/dia**, 1 domínio | teto diário é o mesmo número do mensal dividido por 30 — rajada estoura antes da cota |
| Brevo | 300/dia (~9.000/mês) | cota compartilhada entre marketing e transacional |
| MailerSend | 500/mês, 100/dia | **põe rodapé "Delivered with MailerSend"** no e-mail |
| Amazon SES | US$ 0,10 por 1.000 | precisa sair do *sandbox* por chamado; console mais áspero |

**Recomendado para começar: Resend.** DNS de copiar e colar, API de um POST,
sem cartão de crédito, e o código já fala com ela. Para este volume, os 100/dia
sobram.

⚠️ **Confira você mesmo, antes de decidir:** encontrei uma fonte secundária
dizendo que o plano gratuito da Resend insere marca no e-mail, e outras dizendo
que não insere em transacional. Não consegui abrir o site deles daqui para
confirmar. São 30 segundos na página de preços — e num produto white-label um
rodapé do provedor no e-mail que "vem da imobiliária" é problema.

**Quando trocar:** se a cota diária apertar, o caminho barato é o SES — a US$
0,10 por mil, o volume desta cliente custa **centavos por mês** e nunca insere
marca. O custo dele é setup, não dinheiro. Trocar mexe só em `mailer.ts`.

## Verificar o domínio: o que cada registro faz

**Decisão revista em 24/09.** A primeira versão deste runbook mandava tudo sair
de `usemoradi.com.br`, para nunca haver rodada de DNS por cliente. O que vale
agora:

- **a imobiliária que tem domínio próprio** (o domínio comprado para o site) tem
  esse domínio verificado no Resend, e ele vira o remetente;
- **a que não tem** sai de `usemoradi.com.br`, que continua sendo o fallback de
  todos e por isso é o primeiro a ser verificado.

O motivo da troca: o e-mail que "vem da imobiliária" com `@usemoradi.com.br` no
endereço é o ponto em que o white-label vaza. O custo é uma rodada de DNS por
cliente com domínio — opcional, porque sem ela o envio segue pela plataforma.

O código já está pronto para isso: `server/utils/mail-sender.ts` lê
`tenant_mail_sender.from_address` (migration 0038) e cai para `MAIL_FROM` quando
não há linha.

### Domínio da imobiliária, passo a passo

1. No Resend, **Domains → Add domain** com o domínio da imobiliária.
2. Criar no DNS dela os registros que o Resend mostrar (SPF, DKIM e, opcional,
   DMARC — a mesma lógica das seções abaixo, trocando `usemoradi.com.br` pelo
   domínio dela). Normalmente quem mexe é quem registrou o domínio.
3. Esperar o Resend marcar **Verified**.
4. **Só então** inserir a linha, pela service role (o painel não escreve nessa
   tabela, de propósito):

   ```sql
   insert into public.tenant_mail_sender (tenant_id, from_address, notes)
   values ('<tenant_id>', 'nao-responda@<dominio>', 'verificado no Resend em AAAA-MM-DD')
   on conflict (tenant_id) do update set from_address = excluded.from_address;
   ```

5. Conferir que `tenants.email` está preenchido — é o `Reply-To`. Sem ele, quem
   responde manda para o apex do domínio, que costuma não ter MX, e a resposta
   volta sem ninguém saber (o log avisa com `remetente.dedicado_sem_reply_to`).

⚠️ **A ordem dos passos 3 e 4 não é detalhe.** O fallback para a plataforma só
acontece quando **não há linha**. Linha com domínio que o Resend ainda não
verificou faz o envio **falhar** (502, `mail.falhou` no log) — o convite não sai
por nenhum dos dois caminhos.

⚠️ **O plano gratuito do Resend tem 1 domínio, e a conta aqui é 4:**
`usemoradi.com.br` (fallback, obrigatório) mais `olmiimoveis.com.br`,
`tpimobiliaria.com.br` e `imoveis3lagoas.com.br` — os domínios de `tenant_domains`
(o `www.` é do site e não conta para envio). O plano pago entra já no primeiro
cliente com domínio próprio. Confira na página de preços quantos domínios o
plano cobre e o custo mensal — e que cada imobiliária nova com domínio soma um.

### O domínio da plataforma

São três registros TXT. Sem eles o e-mail vai para spam, porque o provedor de
quem recebe não tem como saber se você pode enviar por aquele domínio.

### 1. SPF — "quais servidores podem enviar por mim"

Registro TXT na raiz (`usemoradi.com.br`), parecido com:

```
v=spf1 include:_spf.resend.com ~all
```

O `include:` diz "os servidores da Resend também estão autorizados". O `~all`
diz "qualquer outro é suspeito".

⚠️ **Só pode existir UM registro SPF no domínio.** Se já houver um (do Google
Workspace, por exemplo), não crie outro — acrescente o `include:` ao que existe.
Dois registros SPF fazem a validação falhar como se não houvesse nenhum, e o
sintoma é "tudo caindo em spam" sem erro visível.

### 2. DKIM — a assinatura criptográfica

Um TXT num subdomínio que o provedor indica (algo como `resend._domainkey`). O
valor é uma chave pública gerada por ele; o servidor assina cada e-mail com a
privada e quem recebe confere.

É copiar e colar do painel do provedor. **Não invente o valor e não reaproveite
de outro domínio.**

### 3. DMARC — "o que fazer quando SPF ou DKIM falham"

TXT em `_dmarc.usemoradi.com.br`. Comece permissivo:

```
v=DMARC1; p=none; rua=mailto:dmarc@usemoradi.com.br
```

`p=none` significa "não rejeite nada, só me mande relatório". É o certo para
começar: com `p=reject` de cara, qualquer erro de configuração vira e-mail
sumindo sem aviso. Depois de algumas semanas de relatório limpo, sobe para
`p=quarantine` e então `p=reject`.

### Onde mexer

O DNS de `usemoradi.com.br` é gerenciado internamente, então não há espera por
terceiro. Propagação costuma levar de minutos a algumas horas; o painel do
provedor mostra quando reconheceu cada registro.

## Ligar no projeto

Duas variáveis de ambiente. As duas são **privadas** — nunca em `public`, que
vai para o bundle do navegador.

```
MAIL_API_KEY=<a chave do provedor>
MAIL_FROM=nao-responda@usemoradi.com.br
```

Na Vercel: Settings → Environment Variables, marcando Production (e Preview, se
quiser testar por lá).

**Sem as duas variáveis**, o comportamento é deliberadamente diferente por
ambiente:

- **em desenvolvimento**, o mailer registra a mensagem no log (com o link) e não
  envia — dá para desenvolver o fluxo inteiro sem conta em provedor nenhum;
- **em produção**, ele **erra alto**. Convite que não sai precisa falhar visível:
  silêncio vira "o cliente diz que não recebeu" e ninguém sabe por quê.

## Migration

`0033_portal_recovery_cooldown.sql` acrescenta `portal_users.last_recovery_at`,
o intervalo mínimo entre dois e-mails de redefinição para a mesma conta.

O motivo é a cota: `/api/portal/recuperar-senha` é público por natureza (quem
esqueceu a senha não está logado). Sem trava, um abusador esgota os 100 e-mails
do dia em um minuto — e a partir daí **nenhum convite e nenhuma recuperação
saem, para nenhum tenant**. A chave é a pessoa, então o teto de abuso passa a
ser o número de clientes reais, não infinito.

## Conferir que funcionou

- [ ] Os três registros aparecem como verificados no painel do provedor — para
      `usemoradi.com.br` **e** para cada domínio de imobiliária cadastrado
- [ ] Teste pelos dois caminhos: um tenant com linha em `tenant_mail_sender` e um
      sem (tem que sair por `MAIL_FROM`)
- [ ] E-mail de teste chega na **caixa de entrada** do Gmail e do Outlook, não no
      spam
- [ ] No Gmail, "Mostrar original" indica `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
- [ ] O remetente exibido é o nome da imobiliária
- [ ] Responder ao e-mail endereça para o e-mail da imobiliária, não para
      `nao-responda@`
- [ ] Pedir redefinição duas vezes seguidas envia **um** e-mail (a segunda cai no
      intervalo e responde igual)
- [ ] Pedir redefinição para um e-mail que não é cliente responde **igual** a um
      que é — sem diferença de texto, status ou tempo perceptível
- [ ] Falha de envio aparece no log, **sem o corpo** (o corpo carrega o link, que
      é credencial)

## Por que a resposta é sempre a mesma

`/api/portal/recuperar-senha` responde `{ ok: true }` em todos os casos: e-mail
inválido, conta inexistente, cliente de outra imobiliária, conta desativada,
dentro do intervalo, falha ao gerar o link, falha no envio.

Diferenciar transformaria o endpoint num verificador de quem é cliente daquela
imobiliária — bastaria testar endereços e observar qual responde diferente. É a
mesma razão pela qual a tela mostra um texto só ("se houver uma conta com esse
e-mail...").
