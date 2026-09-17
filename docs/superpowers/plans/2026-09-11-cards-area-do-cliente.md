# Área do Cliente — cards de execução

**Data:** 2026-09-11
**Origem:** `docs/superpowers/plans/2026-09-10-area-do-cliente.md`
**Total:** 15 cards · 15–19 dias úteis · prazo comercial de 5 semanas

Cada card é autocontido: o dev pega um e tem contexto, abordagem e critério de
aceite sem precisar perguntar. Três seções fixas:

- **PMO** — por que existe e o que muda para quem usa.
- **Tech Lead** — como fazer, onde mexer, e a armadilha conhecida.
- **QA** — o que precisa passar para o card fechar.

Estimativas em dias úteis. Ordem importa: cada fase só é testável depois da
anterior.

---

# FASE 0 — Fundação e blindagem (4–5 dias)

---

## 0.1 — Schema, RLS e storage privado do portal ✅ FEITO

**Estimativa:** 1 dia · **Status:** concluído (commits `c83b2b3`, `8569dff`)

### 🎯 PMO
Base de dados de toda a Área do Cliente: quem é o cliente, o que ele assinou e o
que ele pode baixar. Nada disso existia — o sistema não tinha contrato, documento
nem a figura do cliente-pessoa.

### 🔧 Tech Lead
Entregue em `supabase/migrations/0028_client_area.sql`:

- `portal_users`, `contracts`, `contract_parties`, `portal_documents`,
  `portal_document_access`
- Predicado `is_portal_user()`, espelho de `is_tenant_member()`
- Bucket **privado** `portal-docs` (os três existentes são públicos)
- `revoke` do papel `anon` em todas as tabelas novas
- Regra de acesso pura em `shared/utils/portal-access.ts`, com 11 testes
- Guard `server/utils/portal-auth.ts` (`requirePortalUser`)

Decisão central: **o cliente não é membro do tenant.** `is_tenant_member()` libera
20 policies; um inquilino com linha em `tenant_members` enxergaria a base inteira
da imobiliária.

### ✅ QA
- [x] 299 testes passando
- [x] Nenhum erro novo de typecheck (os 2 existentes em `tenant.mapper.ts` já
      estavam em `main`)
- [ ] **Pendente:** migration ainda NÃO foi aplicada em nenhum ambiente
- [ ] **Pendente:** regerar `shared/types/database.types.ts` após o `db push`
      (foi estendido à mão)

---

## 0.2 — Blindar colunas internas de `properties` contra usuário logado

**Estimativa:** 1 dia · **Prioridade: urgente — bloqueia o restante da fase**

### 🎯 PMO
Hoje o nome e o telefone do proprietário de cada imóvel estão protegidos apenas
contra visitante anônimo, porque todo usuário com login é da imobiliária e
deveria mesmo ver esses dados.

**No dia em que inquilinos e proprietários ganharem senha, isso deixa de ser
verdade.** Qualquer cliente com login passaria a conseguir ler nome e telefone do
proprietário de todo imóvel ativo, de todos os clientes da plataforma. É dado
pessoal de terceiro: além do problema com a imobiliária, é exposição de LGPD.

Este card não entrega nada visível. Ele é pré-requisito de segurança para
qualquer login de cliente existir.

### 🔧 Tech Lead
A migration `0011_harden_schema_and_rls.sql` faz `revoke select on properties from
anon` e devolve o `grant` só nas colunas públicas — `owner_name`, `owner_phone`,
`location` e `broker_id` ficam de fora. **O mesmo `revoke` nunca foi aplicado ao
papel `authenticated`**, que mantém o grant default do Supabase sobre a tabela
inteira.

A policy `properties_public_read` não resolve: RLS filtra **linha**, não coluna.

Passos:

1. Migration nova: `revoke select on public.properties from authenticated` +
   `grant select (<colunas públicas>) on public.properties to authenticated`.
   Copiar a lista de colunas da 0011 para não divergir.
2. O painel quebra com isso, porque lê pelo client do usuário. Trocar os dois
   endpoints de leitura para a service role **com filtro de tenant explícito**:
   - `server/api/admin/properties.get.ts`
   - `server/api/admin/properties/[id].get.ts`
   Os repositories já recebem o client por parâmetro — a assinatura não muda.
3. Seguir o padrão comentado em `server/repositories/member.repository.ts`: com
   service role não há RLS, então **o filtro por tenant na query é a única
   barreira**. Nunca omitir.

⚠️ **Ordem importa:** aplicar o revoke sem trocar os endpoints derruba a listagem
de imóveis do painel em produção. Os dois passos vão na mesma entrega.

### ✅ QA
- [ ] Painel: listar imóveis, abrir um imóvel, editar e salvar — tudo funciona
- [ ] Painel: `owner_name` e `owner_phone` continuam aparecendo para o membro
- [ ] Com um token de usuário autenticado **não-membro**, consulta direta ao
      PostgREST em `properties` não retorna `owner_name`, `owner_phone`,
      `location` nem `broker_id`
- [ ] Catálogo público (anônimo) continua carregando normalmente
- [ ] `pnpm test` verde

---

## 0.3 — Mappers e repositories do portal

**Estimativa:** 1 dia

### 🎯 PMO
Camada de acesso a dados das cinco tabelas novas. Sem ela, nenhuma tela do painel
ou do portal consegue ler ou gravar contrato, cliente e documento.

### 🔧 Tech Lead
Seguir o padrão já estabelecido no repositório — nada de inventar:

- `server/mappers/` converte `snake_case` do Postgres para o `camelCase` do
  domínio. Espelhar `property.mapper.ts`.
- `server/repositories/` retorna **modelos de domínio**, nunca linhas cruas, e
  recebe o client por parâmetro (é o que torna testável sem subir o Nuxt).
- Toda query escopada por `tenant_id`, sem exceção.

Arquivos a criar:

```
server/mappers/contract.mapper.ts
server/mappers/portal-user.mapper.ts
server/mappers/portal-document.mapper.ts
server/repositories/contract.repository.ts
server/repositories/portal-user.repository.ts
server/repositories/portal-document.repository.ts
```

Os modelos já existem em `shared/models/portal.ts`. Atenção ao tipo
`ContractForClient`: é deliberadamente separado de `Contract` e **não tem
`notes`** — a visão do cliente não pode carregar anotação interna. Não "reaproveite"
`Contract` na resposta do portal.

Validação de payload entra em `server/utils/validate.ts`, seguindo
`assertPropertyInput` / `assertBrokerInput`.

### ✅ QA
- [ ] Teste de repositório com o fake de `test/helpers/fake-supabase.ts`
- [ ] Teste que prova que a listagem de contratos de um tenant não devolve
      contrato de outro tenant
- [ ] Teste que prova que a resposta do portal não carrega `notes`

---

## 0.4 — E-mail transacional no domínio da plataforma

**Estimativa:** 1 dia

### 🎯 PMO
O cliente recebe por e-mail o convite para criar a senha. O SMTP embutido do
Supabase limita poucos envios por hora e sai do domínio dele, caindo em spam —
foi por isso que o convite do painel entrega link copiável em vez de e-mail.

Para o portal isso não serve: o cliente final não está no WhatsApp da
imobiliária esperando um link.

### 🔧 Tech Lead
**Decisão travada: o envio sai de `usemoradi.com.br`, o domínio da plataforma —
não do domínio de cada imobiliária.**

Verificar o domínio de cada cliente significaria uma rodada de SPF/DKIM/DMARC por
cliente, para sempre, com gente que geralmente não controla o próprio DNS. Com um
domínio só: configura uma vez, a reputação de envio é construída uma vez, cliente
novo custa zero.

A marca se resolve sem DNS:
- **Nome de exibição** = nome da imobiliária (vem de `tenant.name`)
- **`Reply-To`** = e-mail real da imobiliária (`tenant.email`)

O destinatário vê "Imobiliária X" na caixa e responde para ela.

Escopo:
1. Provider (Resend ou SES) com `usemoradi.com.br` verificado — SPF, DKIM, DMARC.
   O DNS é gerenciado internamente, então não há dependência externa.
2. Util `server/utils/mailer.ts` com remetente por tenant (display name +
   reply-to) e chave em runtimeConfig **privado**, nunca em `public`.
3. Template do convite do portal.
4. Falha de envio precisa virar log — seguir `server/utils/log.ts`. Convite que
   não chega sem deixar rastro vira suporte insolúvel.

Domínio de envio próprio por cliente (`mail.<dominio>` via CNAME) fica como
upgrade futuro, não como padrão.

### ✅ QA
- [ ] E-mail de teste chega na caixa de entrada, não no spam (validar em Gmail e
      Outlook)
- [ ] Cabeçalho mostra o nome da imobiliária; responder vai para o e-mail dela
- [ ] SPF, DKIM e DMARC passando (validar com ferramenta de verificação)
- [ ] Falha de envio aparece no log, sem PII no payload

---

## 0.5 — Autenticação do portal (login, senha, middleware)

**Estimativa:** 1,5 dia

### 🎯 PMO
A porta de entrada do cliente. Inquilino e proprietário entram com e-mail e senha
próprios, no domínio da imobiliária.

### 🔧 Tech Lead
Espelhar o painel, **sem compartilhar sessão com ele**.

1. **Client Supabase separado**, com `storageKey` próprio (ex.:
   `imob-portal-auth`). O painel usa `imob-admin-auth` em
   `app/composables/useAdminAuth.ts`. Compartilhar a chave faria a sessão de um
   sobrescrever a do outro no mesmo navegador — cenário real: a corretora testando
   o portal e perdendo o login do painel.
2. **Carregamento sob demanda.** O Supabase entra por import dinâmico, como no
   painel, para não engordar o bundle das páginas públicas (que são as que têm SEO).
3. `app/composables/usePortalAuth.ts`, `app/middleware/portal.ts`,
   `app/pages/area-cliente/login.vue` e `definir-senha.vue`.
4. O convite reaproveita a mecânica de `inviteMember`
   (`server/repositories/member.repository.ts`): `generateLink` com `redirectTo`
   para `/area-cliente/definir-senha`, no **mesmo host** de onde a requisição
   partiu.
5. ⚠️ Repetir a proteção documentada lá: **se o e-mail já tem conta, não devolver
   link nenhum.** Devolver magic link para um e-mail que pertence a outra pessoa é
   escalação de privilégio.
6. ⚠️ `server/middleware/admin-host.ts` redireciona tudo que não é `/admin` no host
   do painel. Confirmar que `/area-cliente` responde no domínio público e decidir
   o comportamento no host do painel.

### ✅ QA
- [ ] Cliente convidado define senha e entra
- [ ] Sessão do portal e sessão do painel coexistem no mesmo navegador, sem uma
      derrubar a outra
- [ ] Membro do painel tentando entrar no portal recebe mensagem clara ("esta
      conta não tem área do cliente"), não "senha inválida"
- [ ] Cliente de outra imobiliária não entra neste domínio
- [ ] Cliente desativado (`active = false`) não entra
- [ ] Bundle das páginas públicas não cresce (conferir build)

---

# FASE 1 — Painel da imobiliária (4–5 dias)

---

## 1.1 — CRUD de contratos

**Estimativa:** 2 dias

### 🎯 PMO
A imobiliária cadastra o contrato de locação: qual imóvel, quem é o inquilino,
quem é o proprietário, vigência e valor. É o registro que sustenta tudo que o
cliente vê depois.

Carteira inicial: **10 contratos**. Não otimizar para volume.

### 🔧 Tech Lead
- Telas: `app/pages/admin/contratos/index.vue` e `[id].vue`
- Endpoints em `server/api/admin/contracts*`, protegidos por `requireTenantMember`
- Vincular a `properties` quando o imóvel está no catálogo; `address_label` quando
  não está (locação administrada de imóvel nunca anunciado)
- Partes: adicionar pessoas ao contrato com papel (inquilino / proprietário /
  fiador). **O papel fica na relação, não na pessoa** — quem aluga um imóvel e é
  dono de outro é os dois, com uma conta só.
- Campos financeiros (`due_day`, `admin_fee_percent`, `adjustment_index`) entram
  no formulário agora, mesmo sem uso: contrato é dado que alguém digitou, e pedir
  para reabrir cadastro depois é o motivo pelo qual a fase de cobrança não sai.

### ✅ QA
- [ ] Criar, editar e encerrar contrato
- [ ] Código de contrato duplicado no mesmo tenant é recusado com mensagem legível
      (seguir o tratamento de código duplicado de imóvel, commit `8839a9e`)
- [ ] Imóvel excluído do catálogo não apaga o contrato (vira `property_id` nulo)
- [ ] `due_day` fora de 1–31 é recusado; `admin_fee_percent` fora de 0–100 é
      recusado
- [ ] Contrato de outro tenant não aparece nem é acessível por id direto

---

## 1.2 — Cadastro e convite de clientes do portal

**Estimativa:** 1,5 dia

### 🎯 PMO
A imobiliária cadastra inquilinos e proprietários e dispara o convite de acesso.
Precisa também conseguir reenviar o convite e desativar quem saiu — contrato
encerrado tira a pessoa do portal.

### 🔧 Tech Lead
- Tela `app/pages/admin/clientes/index.vue`
- Endpoints `server/api/admin/portal-users*`
- Convite usa o mailer da 0.4 e a mecânica de `generateLink` da 0.5
- `active = false` desliga o acesso **sem apagar o histórico**: a trilha de quem
  baixou o quê continua de pé
- Índice único é `(tenant_id, lower(email))` — tratar a colisão com mensagem
  legível, não com erro 500

### ✅ QA
- [ ] Cadastrar cliente dispara e-mail de convite
- [ ] Reenviar convite funciona
- [ ] E-mail repetido no mesmo tenant é recusado com mensagem clara
- [ ] Mesmo e-mail em dois tenants diferentes é permitido (a pessoa pode ser
      cliente de duas imobiliárias)
- [ ] Desativar cliente bloqueia o login e preserva o histórico

---

## 1.3 — Publicação de documentos

**Estimativa:** 2 dias

### 🎯 PMO
A imobiliária sobe contrato assinado, vistoria e comprovante de pagamento e
publica para o cliente. É o que alimenta a Área do Cliente.

⚠️ **Hoje a cliente recebe por Pix, não por boleto.** A migração para boleto é
intenção sem data. A seção é de **pagamentos** e mostra o que existir: comprovante
de Pix agora, boleto depois. Não rotular a tela como "Boletos".

### 🔧 Tech Lead
- Upload para o bucket **privado** `portal-docs`, path `<slug>/<contract_id>/<uuid>`
- Reaproveitar o que der de `app/components/admin/ImageUploader.vue`, mas **sem**
  gerar URL pública — este bucket não é público
- Campos: categoria, título, competência (mês de referência), vencimento, valor,
  público-alvo, e o botão de publicar
- **Público-alvo vem de `defaultAudienceFor()`** (`shared/utils/portal-access.ts`),
  não de caixinha em branco. Boleto e recibo nascem só do inquilino; extrato só do
  proprietário. Trocar um pelo outro mostra a um cliente quanto o outro paga ou
  recebe.
- `published_at` nulo = rascunho, invisível no portal. Sem isso, um upload no meio
  do expediente aparece pela metade para o cliente.

Fora de escopo nesta fase: **envio em lote**. A 10 documentos por mês não se paga.
Volta quando a carteira crescer.

### ✅ QA
- [ ] Upload de PDF funciona e o arquivo **não** é acessível por URL direta do
      bucket
- [ ] Documento em rascunho não aparece no portal
- [ ] Publicar faz aparecer
- [ ] Categoria boleto sugere audiência "inquilino"; extrato sugere "proprietário"
- [ ] Membro de outro tenant não consegue subir arquivo na pasta deste tenant

---

# FASE 2 — Área do cliente (4–5 dias)

---

## 2.1 — Telas de login e recuperação de senha

**Estimativa:** 0,5 dia

### 🎯 PMO
Primeira tela que o cliente vê. Precisa parecer da imobiliária, não de uma
ferramenta genérica.

### 🔧 Tech Lead
- `app/layouts/portal.vue` usando as CSS vars da marca já injetadas no SSR
  (`brand_primary` / `brand_accent`)
- Recuperação de senha pelo fluxo do Supabase, com o mailer da 0.4
- Mensagens de erro que dizem o que fazer, não "erro ao autenticar"

### ✅ QA
- [ ] Login com as cores e o logo da imobiliária
- [ ] Senha errada dá mensagem clara
- [ ] Recuperação de senha chega por e-mail e funciona
- [ ] Funciona em tela de 360px

---

## 2.2 — Meus contratos e detalhe

**Estimativa:** 1,5 dia

### 🎯 PMO
O cliente entra e vê os contratos dele. Quem aluga um e é dono de outro vê os dois,
com o papel indicado em cada.

### 🔧 Tech Lead
- `app/pages/area-cliente/index.vue` e `contratos/[id].vue`
- Endpoints `server/api/portal/*`, protegidos por `requirePortalUser`
- Responder com `ContractForClient`, **nunca** com `Contract` — `notes` é interna
- Não expor as outras partes do contrato: o inquilino não precisa do contato do
  proprietário para baixar um comprovante. As policies já não expõem; a API também
  não deve.

### ✅ QA
- [ ] Cliente vê só os contratos em que é parte
- [ ] Papel aparece correto em cada contrato
- [ ] Resposta da API não contém `notes`, `external_id` nem `admin_fee_percent`
- [ ] Id de contrato alheio na URL devolve 404/403, não o contrato

---

## 2.3 — Documentos e pagamentos, com download assinado

**Estimativa:** 1,5 dia · **Card mais sensível da entrega**

### 🎯 PMO
O cliente baixa contrato, vistoria e comprovantes. É o que ela viu no concorrente
e o motivo de todo o projeto.

### 🔧 Tech Lead
- Lista agrupada por categoria, ordenada por competência decrescente
- Download **não é link direto**: endpoint confere a permissão e devolve URL
  assinada de vida curta
- ⚠️ **A assinatura usa service role, que ignora RLS** — porque o cliente não tem
  policy de leitura no bucket privado. Nesse caminho,
  `canClientSeeDocument()` de `shared/utils/portal-access.ts` é a **única**
  barreira. Chamar sempre, antes de assinar. Não confiar na policy.
- Gravar `portal_document_access` a cada download (documento, cliente, IP). É a
  resposta para "quem baixou meu contrato?", e ela não pode ser reconstruída depois.
- Rate limit no endpoint — reaproveitar `server/utils/rate-limit.ts`

### ✅ QA
- [ ] Inquilino baixa contrato e vistoria
- [ ] **Proprietário NÃO vê boleto/recibo do inquilino**
- [ ] **Inquilino NÃO vê extrato de repasse do proprietário**
- [ ] Documento em rascunho não aparece para ninguém
- [ ] URL assinada expira e para de funcionar depois do prazo
- [ ] URL assinada de um documento não dá acesso a outro
- [ ] Cada download gera uma linha em `portal_document_access`
- [ ] Cliente desativado não baixa nada

---

## 2.4 — Mobile, estados vazios e entrada pelo site

**Estimativa:** 1,5 dia

### 🎯 PMO
A cliente vai usar isso no celular, e os inquilinos dela também. Um portal que só
funciona no desktop não é usado.

E precisa ter porta de entrada: se ninguém acha o link, ninguém entra.

### 🔧 Tech Lead
- Testar de verdade em 360px, não só no responsivo do navegador
- Estados vazios com texto útil ("nenhum documento publicado ainda" com instrução),
  não área em branco
- Estado de erro que diferencia sessão expirada de falha de rede — o painel já tem
  esse tratamento em `app/composables/useSessionExpired.ts` e
  `shared/utils/session-error.ts`, reaproveitar
- Link "Área do Cliente" no header e no rodapé do site público
- ⚠️ Conferir que a rota nova não entra no `sitemap.xml` nem é indexada

### ✅ QA
- [ ] Fluxo completo em celular real: login → contrato → baixar documento
- [ ] Estados vazios legíveis em todas as telas
- [ ] Sessão expirada mostra aviso e leva ao login, sem tela branca
- [ ] Link visível no site público
- [ ] `/area-cliente` fora do sitemap e com `noindex`

---

# FASE 3 — Endurecimento e produção (3–4 dias)

---

## 3.1 — Testes de isolamento entre clientes

**Estimativa:** 1,5 dia

### 🎯 PMO
A garantia de que um cliente nunca alcança o documento de outro. É o risco que
mata o produto: um vazamento aqui não é bug, é incidente com dado pessoal e
financeiro.

### 🔧 Tech Lead
Suíte dedicada cobrindo, no mínimo:

- Cliente A não lê contrato, documento nem dado de cliente B
- Cliente de outro **tenant** não alcança nada deste tenant
- Membro do painel não vira cliente por acidente, e vice-versa
- Documento em rascunho é invisível
- Audiência é respeitada em todos os caminhos (lista, detalhe e download)
- O caminho do **download assinado** está coberto — é o que não passa por RLS

Seguir `test/server/public-payload-guardrail.test.ts`, que já faz esse tipo de
guarda para o payload público.

### ✅ QA
- [ ] Suíte roda no CI e falha se alguém afrouxar uma policy
- [ ] Cobertura explícita do caminho de service role
- [ ] `pnpm test` verde

---

## 3.2 — Revisão de segurança e LGPD

**Estimativa:** 1 dia

### 🎯 PMO
Contrato de locação é dado pessoal; comprovante de pagamento é dado financeiro.
Antes de abrir para clientes reais, o sistema precisa de uma revisão formal e dos
textos legais atualizados.

### 🔧 Tech Lead
- Rodar `/security-review` na branch e tratar os achados
- Conferir que nenhuma tabela nova ficou com grant de `anon`
- Conferir que `notes`, `external_id` e `admin_fee_percent` não saem em nenhuma
  resposta do portal
- Expiração curta na URL assinada
- Política de privacidade e de retenção atualizadas
  (`shared/utils/footer-pages.ts` já suporta textos por tenant)
- Definir retenção de `portal_document_access`

### ✅ QA
- [ ] Nenhum achado aberto de severidade alta
- [ ] Páginas de privacidade atualizadas e publicadas
- [ ] Retenção da trilha definida e documentada

---

## 3.3 — Deploy e primeiro contrato real

**Estimativa:** 1 dia

### 🎯 PMO
Colocar no ar e cadastrar junto com a imobiliária o primeiro contrato de verdade.
É o card que transforma a entrega em uso.

### 🔧 Tech Lead
1. `supabase db push` em produção
2. **Regerar `shared/types/database.types.ts`** (foi estendido à mão)
3. Configurar a chave do provedor de e-mail no ambiente
4. Cadastrar um contrato real com a cliente, ao vivo, e convidar as duas pontas
5. Acompanhar o primeiro login e o primeiro download

### ✅ QA
- [ ] Migration aplicada sem erro
- [ ] Tipos regerados, `typecheck` sem erro novo
- [ ] Inquilino e proprietário reais logam e baixam
- [ ] Logs de erro limpos nas primeiras 24h

---

## Pendências que não são card, mas travam prazo

| Pendência | De quem | Quando |
|---|---|---|
| Contrato real + PDFs (contrato, vistoria, comprovante) | Imobiliária | Semana 1 |
| Escolha do provedor de cobrança (Cora ou Asaas) e abertura de conta | Imobiliária | Até semana 2 |
| Confirmar se o boleto terá valor fixo ou variável | Imobiliária | Antes da fase de cobrança |

A primeira é a que mais importa: sem um caso real para modelar, as semanas 2 e 4
escorregam.
