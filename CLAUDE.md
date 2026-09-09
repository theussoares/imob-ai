# imob-ai

Plataforma imobiliária **multitenant**: catálogo público + painel `/admin`, uma
implantação servindo vários clientes, resolvidos pelo domínio.

Nuxt 4 (SSR) + Nitro (preset Vercel) · Supabase (Postgres + Auth + Storage) ·
Tailwind v4 · TypeScript · Vitest.

## Comandos

```bash
pnpm dev          # http://localhost:3000 (site) | /admin (painel)
pnpm typecheck    # vue-tsc — roda antes de dar qualquer coisa por pronta
pnpm test         # vitest, Node puro, sem subir o Nuxt (segundos)
```

Não existe script de lint. `pnpm typecheck && pnpm test` é a validação completa.

Atalho de dev: `http://localhost:3000/?tenant=<slug>` troca o tenant e grava
cookie (`?tenant=` vazio limpa). Desativado em produção.

## Idioma

Comentários, mensagens de commit, specs e nomes de domínio em **português**.
Identificadores de código em inglês, seguindo o que já existe no arquivo.

## Arquitetura em camadas

```
app/                 SSR público + painel /admin (SPA, Supabase Auth sob demanda)
server/
  api/               endpoints — públicos (cache 10 min) e admin (protegidos)
  repositories/      acesso a dados, SEMPRE escopado por tenant_id
  mappers/           row do banco (snake_case) <-> modelo de domínio (camelCase)
  middleware/        resolve o tenant pelo Host
  utils/             supabase, auth, cache, tenant, validate, log
shared/models/       modelos de domínio + listas fechadas (fonte única)
supabase/migrations/ schema, RLS, storage — numeradas, idempotentes
test/                unidade em Node puro
```

**Repository nunca devolve row cru.** Ele devolve modelo de `shared/models/*`,
convertido pelo mapper. O schema do Postgres não vaza para a UI. Um endpoint que
faz `.select()` e devolve o resultado direto está errado, mesmo que funcione.

**O client do Supabase entra por parâmetro.** Repositories recebem o client como
primeiro argumento — é o que permite testar com `test/helpers/fake-supabase.ts`
sem subir nada. Não importe o client dentro do repository.

## Invariantes de segurança

Estas quatro regras já foram quebradas em produção. As migrations 0005, 0011 e
0015 existem porque cada uma delas falhou uma vez.

### 1. Toda query é escopada por tenant

Sem exceção. `tenant_id` sai de `useTenantContext(event)` ou de
`requireTenantMember(event)` — **nunca do body da requisição**. Aceitar
`tenantId` do request deixa qualquer usuário autenticado escrever na imobiliária
de outro cliente.

### 2. `serviceSupabase()` ignora RLS — filtre à mão

`server/utils/supabase.ts` exporta dois clients:

- `publicSupabase()` — anon key, RLS ativa, para leitura pública;
- `serviceSupabase()` — service_role, **BYPASSRLS**, para escrita pública
  validada (formulários) e para o painel.

A service_role só existe em `server/`, a chave só em runtimeConfig privado
(`config.supabaseServiceKey`), nunca em `config.public`. Em toda query por ela,
o `tenant_id` é obrigatório no `where`: aqui não há RLS para te salvar.

### 3. Leitura pública não devolve coluna interna

`properties` tem colunas internas — `location`, `broker_id`, `owner_name`,
`owner_phone`, `updated_by` — que nunca podem sair num payload público. A única
exceção deliberada é o **telefone** do corretor captador.

Historicamente quem barrava isso era o banco (o anon só tem `GRANT SELECT` nas
colunas públicas, migrations 0005/0011). Como as leituras públicas passaram a
usar a service_role, **essa proteção não grita mais** — foi assim que
`updated_by` vazou para o JSON público uma vez.

Hoje quem protege é o mapper mais `test/server/public-payload-guardrail.test.ts`.
Consequências práticas:

- leitura pública lista colunas explicitamente, nunca `select('*')`;
- o teste tem uma allowlist (`SELECT_ALL_PERMITIDO`) — função nova cai no teste
  por padrão, e entrar na lista é um ato consciente que aparece na revisão;
- se você adicionar coluna interna a uma tabela, adicione-a também às constantes
  do guardrail.

### 4. Escrita pública passa pelo endpoint, não pelo banco

A anon key vai no HTML de toda página. Tabela que aceita `insert` do papel
público permite pular a validação da API. Padrão: a RLS fecha a escrita para
anon, e o servidor grava por `serviceSupabase()` depois de validar
(ver `server/api/leads.post.ts` e migration 0015).

## Migrations

Arquivo numerado em `supabase/migrations/NNNN_nome.sql`, aplicado via Supabase
CLI ou SQL Editor.

- **Idempotente sempre** (`if not exists`, `drop policy if exists` antes de
  `create policy`): a mesma migration roda em produção, onde parte já existe, e
  num banco limpo.
- **Comentário no topo explicando o porquê**, não o quê. Se corrige uma lacuna,
  diga qual era o sintoma.
- Tabela nova nasce com `enable row level security` **e** as policies. Tabela de
  dado interno leva `revoke all ... from anon` — a policy sozinha não basta,
  porque o Supabase dá GRANT default ao anon.
- Privacidade por coluna exige `revoke select` **antes** do `grant select (...)`,
  nesta ordem.
- `alter type ... add value` vem um por comando (o Postgres não aceita vários).

Valor de enum que entra em URL vai **sem acento** (`barracao`); o rótulo com
acento fica em `shared/models/*`, que é a fonte única.

## Testes

Vitest em Node puro, sem `@nuxt/test-utils` — a escolha é deliberada e está
documentada em `vitest.config.ts`: subir o Nuxt por suíte leva dezenas de
segundos e faz ninguém rodar o teste. O preço é não ter auto-imports do Nuxt;
`test/setup.ts` registra à mão os poucos que o código de servidor usa.

Teste o que tem regra: lógica pura em `shared/`, repositories com
`fakeSupabase`, e invariantes de segurança. Não teste CRUD trivial.

## Estilo de comentário

Este repositório tem uma convenção forte e incomum: **comentário explica por
que, com a alternativa descartada e o custo dela.** Leia
`server/api/leads.post.ts` ou `vitest.config.ts` para calibrar.

Não escreva comentário que narra o código (`// valida o nome`). Escreva o que o
leitor não consegue deduzir: a restrição escondida, o incidente que motivou
aquela linha, por que o caminho óbvio foi rejeitado. Se remover o comentário não
confunde ninguém, ele não devia existir.

Vale para migrations e testes também — os testes deste repo documentam a ameaça
que cobrem.

## Specs e planos

Mudança grande ganha um documento em `docs/superpowers/specs/AAAA-MM-DD-nome-design.md`
antes do código, com: motivo, escopo, **fora do escopo por decisão** e uma tabela
`Decisão | Alternativa descartada | Motivo`. Veja
`docs/superpowers/specs/2026-08-25-urls-seo-design.md`.

## Multitenancy

`server/middleware/tenant.ts` resolve o tenant por requisição: domínio próprio em
`tenant_domains` → subdomínio da plataforma (`<slug>.<NUXT_PLATFORM_DOMAIN>`) →
fallback `NUXT_DEFAULT_TENANT`. Resultado em `event.context.tenant`, cacheado
10 min.

Cores da marca vêm de `tenants.brand_primary`/`brand_accent` e são injetadas como
CSS vars no SSR — trocar de tenant muda o tema sem rebuild.

## Papéis

`tenant_members.role` é `owner | admin` — quem loga no painel. `brokers` é um
**cadastro**, não um usuário: não tem `user_id` e não faz login. Se for
implementar distribuição de lead, SLA ou carteira por corretor, esse vínculo
precisa existir primeiro.
