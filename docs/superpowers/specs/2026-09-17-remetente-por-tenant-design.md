# Remetente de e-mail por imobiliária

**Data:** 2026-09-17
**Motivo:** o `mailer.ts` tem **um** remetente global. O endereço sai de
`config.mailFrom` ([mailer.ts:111](../../../server/utils/mailer.ts)), igual para
todos os tenants, e o `Remetente` carrega só `nome` e `replyTo`.

O plano em que a OLMI se encaixa prevê domínio dedicado. `olmiimoveis.com.br` já
está verificado na conta Resend — DKIM em `resend._domainkey`, SPF e MX de
bounce em `send.` —, e essa verificação está ali **sem ninguém usar**: hoje o
e-mail dela sai como `OLMI IMÓVEIS <nao-responda@usemoradi.com.br>`.

Remetente por tenant é mudança de código, não de configuração.

## Escopo

De onde o endereço do `From` sai, quem pode escrevê-lo, e o que acontece quando
ele não existe ou a leitura falha.

**Fora do escopo, por decisão:**

- **Carência e vencimento.** O remetente dedicado é atributo de setup, não item
  de plano que expira. O portal tem `enabled`/`grace_until` porque suspender o
  acesso do cliente final é o mecanismo de cobrança; aqui o equivalente seria
  trocar a identidade do remetente no meio de uma relação — o cliente final
  veria o e-mail passar a vir de outro lugar, sem entender por quê. Quem
  controla se o dedicado existe é a decisão comercial de configurá-lo.
- **Allowlist de domínios verificados.** Foi considerada como segunda barreira:
  um env var com os domínios que temos na Resend, conferido antes de enviar.
  Descartada porque duplicaria, num segundo lugar, o que já vive na conta do
  provedor — e só a plataforma escreve a linha, ou seja, quem escreve é quem
  verificou. Duas fontes que podem divergir protegem menos do que atrapalham:
  no dia em que divergissem, quem falharia seria a configuração **correta**.
- **Tela no painel.** A linha é escrita por quem vende, como a
  `tenant_features`. Ver "quem escreve", abaixo.
- **DMARC.** É DNS, não código, e está pendente nos dois domínios. Fica
  registrado no fim.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| tabela própria, sem policy de escrita | coluna `mail_from` em `tenants` | `tenants` tem `tenants_member_update` e **nunca** recebeu `revoke update` de coluna; a coluna nasceria gravável pelo membro |
| tabela própria | derivar de `tenant_domains.is_primary` | `tenant_domains_member_write` é `for all` para qualquer membro — a imobiliária escreveria o próprio remetente |
| ausência de linha = plataforma | default explícito por tenant | tenant novo não ganha remetente próprio por esquecimento |
| falha de leitura cai na plataforma | falhar fechado, como o entitlement | falhar fechado aqui é **não mandar o convite**; e-mail do domínio da plataforma é melhor que e-mail nenhum |
| endereço validado antes do cabeçalho | confiar na linha | `montarFrom` sanitiza o nome, não o endereço — que até agora era constante |

## A. Schema — `0038_tenant_mail_sender.sql`

```
tenant_id    uuid primary key references tenants(id) on delete cascade
from_address text not null
notes        text
created_at   timestamptz not null default now()
updated_at   timestamptz not null default now()
```

RLS ligada. **Uma policy só, de SELECT para membro** — o painel pode querer
exibir de onde o e-mail dele sai. Nenhuma policy de escrita, mais
`revoke insert, update, delete, truncate ... from authenticated` e
`revoke all ... from anon`.

O revoke não é redundante com a ausência de policy, e a
[0036](../../../supabase/migrations/0036_blindar_trilha_e_entitlement.sql) já
registrou o porquê: sem ele a proteção é implícita, e no dia em que alguém
acrescentar uma policy `for all` — que é o padrão de quase todas as outras
tabelas deste schema — a escrita passa a ser permitida sem ninguém ter decidido
isso. Não há erro e não há sintoma.

### Quem escreve

Service role, por quem vende. É a mesma postura da `tenant_features`, e aqui o
motivo é mais direto que lá: os dois domínios estão verificados **na mesma conta
Resend**, então quem controla o endereço de envio manda e-mail como o outro
cliente — com SPF e DKIM passando. Isso é pior que phishing comum, porque
autentica.

## B. Leitura — `server/utils/mail-sender.ts`

```
remetenteDoTenant(tenant: Tenant): Promise<string>
```

Recebe o `Tenant`, não o id: ele já carrega `id` e `email`, e o aviso da seção D
depende dos dois. Uma assinatura por id obrigaria a segunda consulta ou jogaria
o aviso para o chamador, onde ele se repetiria nos dois caminhos de envio.

Fonte única, no molde do
[`entitlement.ts`](../../../server/utils/entitlement.ts): service role,
`try/catch` em volta (o `serviceSupabase()` lança quando a chave não está
configurada), `logError` na falha.

**A diferença deliberada em relação ao `entitlement.ts` é a direção da falha.**
Lá o recurso pago erra para "não oferecer", porque a alternativa é entregar algo
que não foi comprado. Aqui, falhar fechado seria não enviar o convite. Um e-mail
saindo do domínio da plataforma é pior que o dedicado e infinitamente melhor que
e-mail nenhum — então erro de leitura cai no `MAIL_FROM` e registra.

## C. O `Remetente` ganha o endereço

`Remetente` passa a ter `endereco: string`, e o `mailer.ts` usa
`msg.remetente.endereco` no lugar de `config.mailFrom`, mantendo o `MAIL_FROM`
como fallback e o guard atual de "sem chave ou sem remetente, erra alto em
produção".

Quem resolve o endereço é o **endpoint**, não o repositório — mesmo desenho que
o `portalOrigin` já usa em
[`portal-users.post.ts`](../../../server/api/admin/portal-users.post.ts): o
endpoint tem o `Tenant` em mãos, e o repositório recebe pronto o que precisa.
`convidarClientePortal` ganha o endereço junto com `tenantNome` e `tenantEmail`,
que ele já recebe. O outro caminho é
[`recuperar-senha.post.ts`](../../../server/api/portal/recuperar-senha.post.ts),
que já monta o `remetente` inteiro.

**Guard novo, e ele é consequência direta desta mudança.** `montarFrom` limpa o
*nome* contra injeção de cabeçalho — quebra de linha num `From` permite
acrescentar um `Bcc:` e transformar o convite num disparo para terceiros. O
endereço nunca precisou disso porque era constante de configuração. Virando dado
de linha, precisa da mesma validação, com fallback para a plataforma se não
passar.

## D. O `Reply-To` e o MX que não existe

O apex de `olmiimoveis.com.br` não tem MX — só `send.` tem, e é para bounce.

Hoje isso não incomoda: o `From` é `@usemoradi.com.br`, ninguém responde para
lá, e o rodapé manda responder sabendo que o `Reply-To` aponta para a
imobiliária. Com o `From` virando `@olmiimoveis.com.br`, o endereço passa a
**parecer** dela, e responder fica natural — enquanto o texto do rodapé continua
dizendo "responda a este e-mail"
([email-templates.ts:94](../../../server/utils/email-templates.ts)).

Se `tenant.email` estiver vazio, o `reply_to` não é incluído
([mailer.ts:124](../../../server/utils/mailer.ts)) e a resposta bounce.

`remetenteDoTenant` emite `logWarn` quando o tenant tem remetente dedicado e não
tem `tenant.email`. Não bloqueia o envio: transforma um bounce silencioso em
linha de log, que é o que falta hoje.

## Testes

- o `From` usa o endereço do tenant quando há linha;
- sem linha, cai no `MAIL_FROM`;
- falha de leitura cai no `MAIL_FROM` **e** registra;
- endereço malformado não chega ao cabeçalho;
- guardrail de fonte: o caminho de envio não lê `config.mailFrom` fora do
  fallback — é a regra que some num refactor sem deixar erro, porque o código
  continua enviando, só que do domínio errado.

## Riscos aceitos

- **Uma consulta a mais por envio.** O caminho de envio já fala com um provedor
  externo; o custo relativo é ruído. Não há cache, de propósito: o volume é de
  dezenas por mês e cache invalidado errado aqui significa e-mail saindo do
  domínio errado.
- **A linha e a verificação na Resend podem divergir.** Cadastrar um
  `from_address` de domínio não verificado faz a Resend recusar, e o sintoma é
  502 no convite com `mail.falhou` no log. É o preço de não duplicar a
  allowlist, e é assumido: falha na hora, com rastro, em vez de silêncio.

## Pendente fora do código

**DMARC ausente nos dois domínios.** `usemoradi.com.br` e `olmiimoveis.com.br`
têm DKIM e SPF corretos, e nenhum tem `_dmarc`. Comece permissivo
(`v=DMARC1; p=none`) e aponte o `rua` para um endereço que receba de verdade — o
apex de nenhum dos dois tem MX. Ver o
[runbook 0034](../../runbooks/0034-email-transacional.md).
