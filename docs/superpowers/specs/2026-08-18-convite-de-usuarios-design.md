# Convite de usuários ao painel

**Data:** 2026-08-18
**Motivo:** uma imobiliária entrou com 4 a 6 pessoas usando o painel. Hoje não
existe caminho para criar acesso: `tenant_members` tem RLS só de leitura e cada
usuário precisa ser criado à mão no dashboard do Supabase e vinculado por SQL.
Sem isso, a alternativa prática é login compartilhado — que inviabiliza qualquer
auditoria depois.

## Escopo

Uma tela, `/admin/usuarios`: convidar, listar, revogar.

**Fora do escopo, por decisão:**

- **Criar usuário com senha definida por outra pessoa.** A senha nasceria
  conhecida por um terceiro e trafegaria por WhatsApp. É o que aconteceu com a
  conta `demo@usemoradi.com.br`. O convite resolve melhor: a pessoa define a
  própria senha e ninguém mais a conhece.
- **Papéis (`owner`/`admin`).** A coluna existe no banco desde a 0001, mas o
  cliente confirmou que as 4-6 pessoas têm o mesmo poder. Criar hierarquia agora
  é inventar atrito que ninguém pediu. Decisão reversível: com `updated_by`
  gravado, dá para introduzir papéis depois sem perder histórico.
- **Tabela separada de convites.** O vínculo em `tenant_members` nasce junto com
  o convite; "pendente" é simplesmente quem ainda não confirmou o e-mail. Menos
  estado para desincronizar.
- **Envio por e-mail.** O SMTP embutido do Supabase limita a poucos envios por
  hora e sai de domínio dele, caindo em spam. Com 6 convites de uma vez, tem boa
  chance de não chegar. O link é copiável e vai por WhatsApp, que é como o
  cliente já se comunica. Se um dia houver SMTP próprio, o envio automático entra
  por cima sem refazer nada.

## Fluxo

1. Membro abre `/admin/usuarios` e informa o e-mail.
2. Servidor, com `serviceSupabase()` (a chave pública não escreve em
   `tenant_members` — não há policy de insert):
   - procura o usuário pelo e-mail;
   - **não existe:** `auth.admin.generateLink({ type: 'invite' })` cria o usuário
     e devolve o link de ação;
   - **já existe:** não gera link; só cria o vínculo e responde que a pessoa já
     tem conta;
   - grava `tenant_members` com o tenant **de quem chamou**.
3. A tela mostra o link uma vez, com botão de copiar.
4. A pessoa abre o link, define a senha e entra.

## Invariantes de segurança

Estas são as regras que não podem cair. Cada uma tem teste.

1. **O tenant vem sempre de `requireTenantMember`, nunca do body.** É a falha
   clássica deste tipo de endpoint: quem controla o `tenantId` enviado se
   adiciona à imobiliária de outro cliente.
2. **Ninguém remove a si mesmo.** Evita o clique errado que tira o próprio
   acesso.
3. **Não se remove o último membro.** Sem isso, a imobiliária fica trancada fora
   do próprio painel e só um SQL manual destrava.
4. **O link não é persistido.** Link de convite é credencial temporária; guardar
   no banco seria criar uma senha em texto puro com outro nome.
5. **Convite não duplica vínculo.** Reconvidar alguém que já é membro não cria
   segunda linha nem quebra.
6. **Nunca gerar link para e-mail que já tem conta.** Seria cômodo devolver um
   magic link para a pessoa entrar — e é uma escalação de privilégio. Se aquele
   e-mail pertence a um membro de OUTRA imobiliária, quem convidou clica no link
   e entra como ele, enxergando os dados do outro cliente. Usuário existente
   recebe vínculo e nada mais.

## Passo manual necessário (dashboard do Supabase)

**Sem isto o convite não funciona** — e falha em silêncio. Duas configurações em
Authentication → URL Configuration:

**Site URL** — não aceita curinga (a própria tela avisa). Domínio real:

```
https://usemoradi.com.br
```

**Redirect URLs** — precisa terminar em `/**`:

```
https://*.tpimobiliaria.com.br/**
https://*.usemoradi.com.br/**
https://tpimobiliaria.com.br/**
https://usemoradi.com.br/**
http://localhost:3000/**
```

O `/**` não é enfeite. Na regra do Supabase, `*` casa com "qualquer sequência de
caracteres que não sejam separadores", e os separadores são `.` e `/`. Logo
`https://*.tpimobiliaria.com.br` casa só com a URL SEM caminho — e o
`redirect_to` que enviamos é `.../admin/definir-senha`. Sem o `/**` ele não casa,
o Supabase descarta e manda a pessoa para o Site URL.

Foi exatamente o que aconteceu no primeiro teste: o convite gerado a partir de
`painel.tpimobiliaria.com.br` foi parar em `localhost:3000` (o Site URL da
época), com o token no fragmento de uma página que o ignora.

Mitigação em código: o plugin `auth-hash-rescue.client.ts` detecta token de
convite/recuperação chegando em qualquer página do app e encaminha para
`/admin/definir-senha` preservando o fragmento. Isso impede o beco sem saída,
mas não substitui a allowlist correta — com ela errada, o convite gerado em um
cliente pode aterrissar no domínio de outro.

## Caso que vai acontecer

E-mail que já tem conta, seja porque a pessoa atende duas imobiliárias suas, seja
porque você reconvidou alguém. `generateLink({ type: 'invite' })` falha nesse
caso. Tratar como erro faria parecer que o painel quebrou; o certo é criar o
vínculo e avisar que a pessoa já tem acesso e é só entrar.

## Pendências relacionadas

- Trocar a senha de `demo@usemoradi.com.br`, que passou pelo chat.
- Habilitar *leaked password protection* e MFA (TOTP) no dashboard.
- `updated_by` nas tabelas editáveis, para que "quem alterou isso?" tenha
  resposta entre membros de igual poder.
