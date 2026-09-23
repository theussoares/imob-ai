# E2E da Área do Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** provar, num browser de verdade, que a regra de audiência em TypeScript e
as policies de RLS da 0028 concordam — inquilino, proprietário e fiador vendo
exatamente o que lhes cabe e nada além.

**Architecture:** Playwright local, fora de `pnpm test`. Cada execução cria um
tenant descartável `e2e-<runid>` por service role, monta contrato com os três
papéis e seis documentos, dirige a interface só onde uma tela decide audiência, e
apaga tudo no fim. Nenhuma credencial humana envolvida: o teste gera as senhas
que usa.

**Tech Stack:** `@playwright/test` (única dependência nova), `@supabase/supabase-js`
(já é dependência), `process.loadEnvFile` do Node 22 para ler o `.env` sem `dotenv`.

**Spec:** [docs/superpowers/specs/2026-09-20-e2e-area-do-cliente-design.md](../specs/2026-09-20-e2e-area-do-cliente-design.md)

## Global Constraints

- **Nunca** acrescentar Playwright ao script `test`. O comando é `test:e2e`, separado.
  Razão registrada em `vitest.config.ts`: "teste lento é teste que ninguém roda".
- Comentários, nomes de teste e mensagens em **português**; identificadores de
  código em inglês, seguindo o arquivo.
- Comentário explica **por que**, com a alternativa descartada e o custo dela.
  Comentário que narra o código (`// clica no botão`) não entra.
- Todo slug de tenant criado pela suíte começa com `e2e-`. É o que a varredura usa.
- O projeto Supabase é **o mesmo de produção** (`eixzfjmmcocuxnprqskf`). Nenhuma
  operação pode tocar tenant cujo slug não comece com `e2e-`.
- Porta do dev server nos testes: **3000**.
- `.env` já é gitignored; `storageState` e artefatos do Playwright também precisam ser.

---

### Task 1: Harness do Playwright, provado por um teste de fumaça

Antes de qualquer provisionamento, provar que o runner sobe o app e enxerga a
página. Se esta tarefa não fecha, nenhuma das outras faz sentido.

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `playwright.config.ts`
- Create: `e2e/fumaca.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: `pnpm test:e2e` executável; `baseURL` `http://localhost:3000` para todos
  os specs seguintes.

- [ ] **Step 1: Instalar a dependência e o browser**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Criar `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

// O `.env` é lido aqui, não pelo Nuxt: o Playwright roda fora do app e precisa
// da service role para provisionar. `loadEnvFile` é do Node 22 — evita somar
// `dotenv` ao projeto por causa de uma linha.
process.loadEnvFile('.env')

export default defineConfig({
  testDir: './e2e',
  // Serial de propósito. Os testes compartilham UM tenant e UM contrato, e o
  // `?tenant=` do dev grava cookie — paralelizar faria uma worker trocar o
  // tenant debaixo da outra.
  workers: 1,
  fullyParallel: false,
  // Sem retry: teste de vazamento que passa "na segunda" é teste que ninguém
  // acredita. Falhou, é para olhar.
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // Reusa o dev server que já estiver de pé: subir o Nuxt leva dezenas de
    // segundos e quem roda isto local costuma já ter um aberto.
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Acrescentar o script ao `package.json`**

Dentro de `"scripts"`, ao lado de `"test": "vitest run"`:

```json
    "test:e2e": "playwright test",
```

- [ ] **Step 4: Ignorar os artefatos**

Acrescentar ao fim do `.gitignore`:

```gitignore
# Playwright
/test-results
/playwright-report
/e2e/.auth
```

- [ ] **Step 5: Escrever o teste de fumaça**

Criar `e2e/fumaca.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/**
 * Não testa regra nenhuma — testa o harness.
 *
 * Existe porque as tarefas seguintes provisionam banco antes de abrir o
 * browser, e uma falha ali é indistinguível de "o Playwright não sobe o app".
 * Separar os dois custa dez linhas e economiza a primeira meia hora de
 * depuração no lugar errado.
 */
test('o app responde e a home da demo renderiza', async ({ page }) => {
  await page.goto('/?tenant=demo')
  await expect(page).toHaveTitle(/Aurora Imóveis/)
})
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test:e2e`
Expected: 1 passed.

- [ ] **Step 7: Provar que o teste sabe falhar**

Trocar `Aurora Imóveis` por `Imobiliária Inexistente`, rodar de novo.
Expected: FAIL com o título recebido no diff. Depois **desfazer a troca** e rodar
mais uma vez para voltar ao verde.

Sem este passo não se sabe se a asserção está ligada em coisa nenhuma.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e/fumaca.spec.ts .gitignore
git commit -m "test(e2e): harness do Playwright, fora do pnpm test"
```

---

### Task 2: Tenant descartável — provisionamento, varredura e teardown

O andaime inteiro numa tarefa: sem contrato e partes ele não serve para nada, e um
revisor não aprovaria "cria tenant" sem ver o que se faz com ele.

**Files:**
- Create: `e2e/support/supabase.ts`
- Create: `e2e/support/tenant.ts`
- Create: `e2e/support/dados.ts`
- Create: `e2e/provisionamento.spec.ts`

**Interfaces:**
- Consumes: `baseURL` da Task 1.
- Produces:
  - `service(): SupabaseClient` — client de service role.
  - `criarAmbiente(): Promise<Ambiente>` — cria tudo e devolve os ids.
  - `apagarAmbiente(slug: string): Promise<void>`
  - `varrerAmbientesAntigos(): Promise<number>` — devolve quantos apagou.
  - `type Ambiente = { slug, tenantId, contratoId, membro: Conta, inquilino: Cliente, proprietario: Cliente, fiador: Cliente, documentos: Record<ChaveDoc, string> }`
  - `type Conta = { userId: string; email: string; senha: string }`
  - `type Cliente = Conta & { portalUserId: string }`
  - `type ChaveDoc = 'contrato' | 'vistoria' | 'boleto' | 'extrato' | 'administracao' | 'rascunho'`

- [ ] **Step 1: Escrever o client de service role**

Criar `e2e/support/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client de service role para o provisionamento.
 *
 * ⚠️ Este é o MESMO projeto Supabase de produção — dev e produção dividem
 * `eixzfjmmcocuxnprqskf`. Tudo aqui escreve no banco dos clientes reais, e é por
 * isso que cada função abaixo é escopada por um tenant `e2e-*` e nunca por id
 * solto. Um `delete` sem `where` de slug aqui apaga cliente de verdade.
 */
export function service(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env para o E2E rodar.',
    )
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
```

- [ ] **Step 2: Escrever a matriz de documentos, como dado**

Criar `e2e/support/dados.ts`:

```ts
// Import RELATIVO, não `~~/shared/...`.
//
// O alias `~~` é do Nuxt e existe no `vitest.config.ts`; o Playwright roda fora
// dos dois e não resolveria. Errar isto custa um "Cannot find module" que parece
// erro de tipo e não é.
import type { ContractPartyRole } from '../../shared/models/portal'

export type ChaveDoc = 'contrato' | 'vistoria' | 'boleto' | 'extrato' | 'administracao' | 'rascunho'

/**
 * A matriz da spec, como dado — e a fonte única das asserções.
 *
 * Fica aqui, e não espalhada nos specs, porque quem muda a regra de audiência
 * precisa ver num lugar só o que cada papel deixa de enxergar. `audiencia` repete
 * de propósito o resultado de `defaultAudienceFor`: se a função mudar, o teste
 * falha em vez de acompanhar em silêncio — que é o ponto de ter o teste.
 */
export const DOCUMENTOS: Record<
  ChaveDoc,
  { titulo: string; categoria: string; audiencia: ContractPartyRole[]; publicado: boolean }
> = {
  contrato: {
    titulo: 'Contrato de locação assinado',
    categoria: 'contrato',
    audiencia: ['inquilino', 'proprietario', 'fiador'],
    publicado: true,
  },
  vistoria: {
    titulo: 'Vistoria de entrada',
    categoria: 'vistoria',
    audiencia: ['inquilino', 'proprietario', 'fiador'],
    publicado: true,
  },
  boleto: {
    titulo: 'Boleto de setembro',
    categoria: 'boleto',
    audiencia: ['inquilino'],
    publicado: true,
  },
  extrato: {
    titulo: 'Extrato de repasse de setembro',
    categoria: 'extrato',
    audiencia: ['proprietario'],
    publicado: true,
  },
  administracao: {
    titulo: 'Contrato de administração',
    categoria: 'contrato_administracao',
    audiencia: ['proprietario'],
    publicado: true,
  },
  rascunho: {
    titulo: 'Recibo de outubro (rascunho)',
    categoria: 'recibo',
    audiencia: ['inquilino'],
    publicado: false,
  },
}

/** Quantos documentos cada papel deve enxergar. Derivado da matriz acima. */
export const ESPERADO: Record<ContractPartyRole, number> = {
  inquilino: 3,
  proprietario: 4,
  fiador: 2,
}
```

- [ ] **Step 3: Escrever o provisionador**

Criar `e2e/support/tenant.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { service } from './supabase'
import { DOCUMENTOS, type ChaveDoc } from './dados'

export interface Conta {
  userId: string
  email: string
  senha: string
}
export interface Cliente extends Conta {
  portalUserId: string
}
export interface Ambiente {
  slug: string
  tenantId: string
  contratoId: string
  membro: Conta
  inquilino: Cliente
  proprietario: Cliente
  fiador: Cliente
  documentos: Record<ChaveDoc, string>
}

/** Prefixo que a varredura procura. Mudar aqui sem mudar lá deixa lixo para sempre. */
const PREFIXO = 'e2e-'

/**
 * Senha de uso único, gerada pelo teste.
 *
 * É o que dispensa qualquer credencial humana: nada em `.env`, nada em
 * `storageState`, nada passando por conversa. A conta vive minutos e é apagada.
 */
function senhaDescartavel(): string {
  return `E2e!${randomUUID()}`
}

async function criarConta(email: string): Promise<Conta> {
  const senha = senhaDescartavel()
  const { data, error } = await service().auth.admin.createUser({
    email,
    password: senha,
    // Sem isto a conta nasce pendente de confirmação e o login recusa.
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`não criou a conta ${email}: ${error?.message}`)
  return { userId: data.user.id, email, senha }
}

/**
 * Cria o tenant descartável e tudo dentro dele.
 *
 * O tenant é próprio, e não a `demo`, por dois motivos: a `demo` é o que se mostra
 * ao cliente, e um teardown que falhe deixaria lixo numa base de demonstração; e
 * o `tenant_id` isola pelo mesmo mecanismo que o produto já garante, que é a
 * invariante número 1 do repositório.
 */
export async function criarAmbiente(): Promise<Ambiente> {
  const sb = service()
  const runId = randomUUID().slice(0, 8)
  const slug = `${PREFIXO}${runId}`

  const { data: tenant, error: erroTenant } = await sb
    .from('tenants')
    .insert({ slug, name: `E2E ${runId}` })
    .select('id')
    .single()
  if (erroTenant || !tenant) throw new Error(`não criou o tenant: ${erroTenant?.message}`)
  const tenantId = tenant.id as string

  // O portal precisa estar ligado, senão `requirePortalUser` devolve 403 antes
  // de qualquer asserção de audiência.
  const { error: erroFeature } = await sb
    .from('tenant_features')
    .insert({ tenant_id: tenantId, feature: 'portal', enabled: true })
  if (erroFeature) throw new Error(`não ligou o portal: ${erroFeature.message}`)

  // Membro do painel. O `role` é `owner` porque é quem pode tudo — o teste não
  // está medindo a diferença entre owner e admin.
  const membro = await criarConta(`membro-${runId}@e2e.invalid`)
  const { error: erroMembro } = await sb
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: membro.userId, role: 'owner' })
  if (erroMembro) throw new Error(`não vinculou o membro: ${erroMembro.message}`)

  const { data: contrato, error: erroContrato } = await sb
    .from('contracts')
    .insert({
      tenant_id: tenantId,
      code: `E2E-${runId}`,
      address_label: 'Rua de Teste, 1 — Centro',
      status: 'ativo',
    })
    .select('id')
    .single()
  if (erroContrato || !contrato) throw new Error(`não criou o contrato: ${erroContrato?.message}`)
  const contratoId = contrato.id as string

  async function criarCliente(papel: 'inquilino' | 'proprietario' | 'fiador'): Promise<Cliente> {
    const conta = await criarConta(`${papel}-${runId}@e2e.invalid`)
    const { data, error } = await sb
      .from('portal_users')
      .insert({
        tenant_id: tenantId,
        user_id: conta.userId,
        name: `${papel} ${runId}`,
        email: conta.email,
        // Nasce confirmado: o vínculo foi criado aqui, não veio de conta de
        // terceiro. É a mesma regra do caso 1 em `portal-invite.repository.ts`.
        access_confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`não criou o cliente ${papel}: ${error?.message}`)

    const { error: erroParte } = await sb
      .from('contract_parties')
      .insert({ contract_id: contratoId, portal_user_id: data.id, role: papel })
    if (erroParte) throw new Error(`não vinculou a parte ${papel}: ${erroParte.message}`)

    return { ...conta, portalUserId: data.id as string }
  }

  const inquilino = await criarCliente('inquilino')
  const proprietario = await criarCliente('proprietario')
  const fiador = await criarCliente('fiador')

  // Os documentos, com um arquivo real no bucket para a URL assinada ter o que
  // assinar. Um PDF mínimo basta: o teste mede quem pode baixar, não o conteúdo.
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  const documentos = {} as Record<ChaveDoc, string>

  for (const [chave, d] of Object.entries(DOCUMENTOS) as [ChaveDoc, (typeof DOCUMENTOS)[ChaveDoc]][]) {
    const caminho = `${slug}/${contratoId}/${chave}.pdf`
    const { error: erroUp } = await sb.storage
      .from('portal-docs')
      .upload(caminho, pdf, { contentType: 'application/pdf', upsert: true })
    if (erroUp) throw new Error(`não subiu ${chave}: ${erroUp.message}`)

    const { data, error } = await sb
      .from('portal_documents')
      .insert({
        tenant_id: tenantId,
        contract_id: contratoId,
        category: d.categoria,
        title: d.titulo,
        storage_path: caminho,
        audience: d.audiencia,
        published_at: d.publicado ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`não gravou ${chave}: ${error?.message}`)
    documentos[chave] = data.id as string
  }

  return { slug, tenantId, contratoId, membro, inquilino, proprietario, fiador, documentos }
}

/**
 * Apaga o tenant e tudo que pendura nele.
 *
 * ⚠️ O cascade de `tenant_id` leva contratos, partes, documentos e trilha, mas
 * **não leva os objetos do bucket** — storage não participa de foreign key. Por
 * isso os arquivos saem antes, explicitamente. Confiar no cascade aqui deixaria
 * PDF órfão acumulando a cada execução.
 */
export async function apagarAmbiente(slug: string): Promise<void> {
  if (!slug.startsWith(PREFIXO)) {
    throw new Error(`recusando apagar "${slug}": não é tenant de teste`)
  }
  const sb = service()

  const { data: arquivos } = await sb.storage.from('portal-docs').list(slug, { limit: 1000 })
  for (const pasta of arquivos ?? []) {
    const { data: dentro } = await sb.storage
      .from('portal-docs')
      .list(`${slug}/${pasta.name}`, { limit: 1000 })
    const caminhos = (dentro ?? []).map((f) => `${slug}/${pasta.name}/${f.name}`)
    if (caminhos.length) await sb.storage.from('portal-docs').remove(caminhos)
  }

  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (!tenant) return

  // As contas do Auth não penduram em `tenant_id` — saem uma a uma, pelos
  // `user_id` que o tenant conhece, antes de o cascade apagar as linhas que os
  // apontam.
  const { data: clientes } = await sb.from('portal_users').select('user_id').eq('tenant_id', tenant.id)
  const { data: membros } = await sb.from('tenant_members').select('user_id').eq('tenant_id', tenant.id)
  for (const u of [...(clientes ?? []), ...(membros ?? [])]) {
    if (u.user_id) await sb.auth.admin.deleteUser(u.user_id)
  }

  await sb.from('tenants').delete().eq('id', tenant.id)
}

/**
 * Varre restos de execuções anteriores.
 *
 * A segunda rede, e a que importa: o teardown não roda quando alguém dá `Ctrl+C`
 * no meio, e uma única execução interrompida deixaria tenant órfão permanente no
 * banco dos clientes reais. Uma hora é folga suficiente para não atropelar uma
 * execução em curso em outra máquina.
 */
export async function varrerAmbientesAntigos(): Promise<number> {
  const limite = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data } = await service()
    .from('tenants')
    .select('slug')
    .like('slug', `${PREFIXO}%`)
    .lt('created_at', limite)

  for (const t of data ?? []) await apagarAmbiente(t.slug as string)
  return (data ?? []).length
}
```

- [ ] **Step 4: Escrever o teste que prova o ciclo**

Criar `e2e/provisionamento.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, varrerAmbientesAntigos } from './support/tenant'
import { service } from './support/supabase'

/**
 * A suíte inteira depende deste ciclo, e ele escreve no banco dos clientes
 * reais. Um teardown quebrado não aparece como falha em lugar nenhum — aparece
 * como lixo acumulando. Por isso ele é testado explicitamente, antes de
 * qualquer asserção de produto.
 */
test('o ambiente nasce completo e some por inteiro', async () => {
  const amb = await criarAmbiente()

  const sb = service()
  const { data: antes } = await sb
    .from('portal_documents')
    .select('id')
    .eq('tenant_id', amb.tenantId)
  expect(antes).toHaveLength(6)

  const { data: partes } = await sb
    .from('contract_parties')
    .select('role')
    .eq('contract_id', amb.contratoId)
  expect(partes?.map((p) => p.role).sort()).toEqual(['fiador', 'inquilino', 'proprietario'])

  await apagarAmbiente(amb.slug)

  const { data: depois } = await sb.from('tenants').select('id').eq('slug', amb.slug)
  expect(depois).toHaveLength(0)

  // Os arquivos também: o cascade não os leva, e esquecer disso só apareceria
  // meses depois, como bucket crescendo sem motivo.
  const { data: sobrou } = await sb.storage.from('portal-docs').list(amb.slug)
  expect(sobrou ?? []).toHaveLength(0)
})

test('a varredura recusa apagar tenant que não é de teste', async () => {
  // A guarda que separa "limpa o lixo" de "apaga um cliente".
  await expect(apagarAmbiente('demo')).rejects.toThrow(/não é tenant de teste/)
})

test('a varredura roda sem explodir', async () => {
  const apagados = await varrerAmbientesAntigos()
  expect(apagados).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 5: Rodar e ver falhar pelo motivo certo**

Run: `pnpm test:e2e e2e/provisionamento.spec.ts`
Expected: FAIL. Antes do Step 3 estar salvo, o erro é de módulo não encontrado;
com ele salvo, o primeiro erro real costuma ser a chave ausente no `.env`.

- [ ] **Step 6: Fazer passar**

Conferir que `.env` tem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, rodar de novo.
Expected: 3 passed.

- [ ] **Step 7: Confirmar à mão que não sobrou nada**

```bash
pnpm exec playwright test e2e/provisionamento.spec.ts
```

Depois, no SQL Editor do Supabase:

```sql
select slug, created_at from public.tenants where slug like 'e2e-%';
```

Expected: nenhuma linha. Se sobrar, o teardown está incompleto — corrigir antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add e2e/support e2e/provisionamento.spec.ts
git commit -m "test(e2e): tenant descartável com varredura e teardown do bucket"
```

---

### Task 3: A matriz de audiência

O coração da suíte. Depois desta tarefa, a pergunta "as duas barreiras concordam?"
tem resposta medida.

**Files:**
- Create: `e2e/support/portal.ts`
- Create: `e2e/audiencia.spec.ts`

**Interfaces:**
- Consumes: `criarAmbiente`, `apagarAmbiente`, `Ambiente`, `Cliente` da Task 2;
  `DOCUMENTOS`, `ESPERADO` da Task 2.
- Produces: `entrarNoPortal(page, slug, cliente): Promise<void>`

- [ ] **Step 1: Escrever o helper de login**

Criar `e2e/support/portal.ts`:

```ts
import { expect, type Page } from '@playwright/test'
import type { Cliente } from './tenant'

/**
 * Entra no portal pela tela de verdade.
 *
 * Não injeta sessão no `localStorage` de propósito: a tela de login é onde
 * `portalAccessDenial` roda, e pular isso deixaria de fora a checagem que
 * distingue "não é cliente daqui" de "acesso desativado" — as duas frases que
 * existem justamente para a pessoa não ficar tentando a senha para sempre.
 *
 * O `?tenant=` é o atalho de dev e só funciona fora de produção
 * (`VERCEL_ENV !== 'production'`); é o que permite abrir o tenant descartável
 * sem cadastrar domínio.
 */
export async function entrarNoPortal(page: Page, slug: string, cliente: Cliente): Promise<void> {
  await page.goto(`/area-cliente/login?tenant=${slug}`)
  await page.locator('#email').fill(cliente.email)
  await page.locator('#senha').fill(cliente.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Meus contratos' })).toBeVisible()
}
```

- [ ] **Step 2: Escrever o teste da matriz**

Criar `e2e/audiencia.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { DOCUMENTOS, ESPERADO } from './support/dados'
import { entrarNoPortal } from './support/portal'

/**
 * A regra de quem vê cada documento existe em DOIS lugares de propósito:
 * `canClientSeeDocument` em TypeScript e as policies da 0028 no banco. Os
 * comentários afirmam que as duas concordam; nada media isso até aqui.
 *
 * O modo de falha é silencioso e caro: as duas discordando para o lado
 * permissivo mostra ao inquilino quanto o proprietário recebe, ou o contrato de
 * administração — que traz a taxa, a conta bancária e o Pix pessoal dele.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('o inquilino vê exatamente os três documentos dele', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.inquilino)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  const itens = page.locator('ul.docs li')
  // Contagem EXATA, não `toContain`: o defeito que este teste existe para pegar
  // é um documento A MAIS, e `toContain` passaria feliz por ele.
  await expect(itens).toHaveCount(ESPERADO.inquilino)

  await expect(page.getByText(DOCUMENTOS.contrato.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.vistoria.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.boleto.titulo)).toBeVisible()

  // O que ele NÃO pode ver, nomeado um a um. Um `expect(count)` sozinho diria
  // que são três, não QUAIS três.
  await expect(page.getByText(DOCUMENTOS.extrato.titulo)).toHaveCount(0)
  await expect(page.getByText(DOCUMENTOS.administracao.titulo)).toHaveCount(0)
  await expect(page.getByText(DOCUMENTOS.rascunho.titulo)).toHaveCount(0)
})

test('o proprietário vê os dele, incluindo o contrato de administração', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.proprietario)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  await expect(page.locator('ul.docs li')).toHaveCount(ESPERADO.proprietario)
  await expect(page.getByText(DOCUMENTOS.extrato.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.administracao.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.boleto.titulo)).toHaveCount(0)
  await expect(page.getByText(DOCUMENTOS.rascunho.titulo)).toHaveCount(0)
})

test('o fiador vê só o que as duas pontas assinaram', async ({ page }) => {
  // O papel sem um único dado no banco antes desta suíte, e o de audiência mais
  // restrita: nada de boleto, extrato ou contrato de administração.
  await entrarNoPortal(page, amb.slug, amb.fiador)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()

  await expect(page.locator('ul.docs li')).toHaveCount(ESPERADO.fiador)
  await expect(page.getByText(DOCUMENTOS.contrato.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.vistoria.titulo)).toBeVisible()
  await expect(page.getByText(DOCUMENTOS.boleto.titulo)).toHaveCount(0)
  await expect(page.getByText(DOCUMENTOS.extrato.titulo)).toHaveCount(0)
  await expect(page.getByText(DOCUMENTOS.administracao.titulo)).toHaveCount(0)
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test:e2e e2e/audiencia.spec.ts`
Expected: FAIL — `e2e/support/portal.ts` ainda não existe se o Step 1 não foi salvo;
salvo, a falha esperada é o seletor `ul.docs li` não achar nada até o login funcionar.

- [ ] **Step 4: Fazer passar**

Ajustar o que a falha apontar (seletor, rota) e rodar de novo.
Expected: 3 passed.

- [ ] **Step 5: Provar que o teste pega o vazamento**

Este é o passo que dá valor ao arquivo. Em `e2e/support/dados.ts`, trocar a
audiência do extrato para incluir o inquilino:

```ts
  extrato: {
    titulo: 'Extrato de repasse de setembro',
    categoria: 'extrato',
    audiencia: ['proprietario', 'inquilino'], // TEMPORÁRIO
    publicado: true,
  },
```

Run: `pnpm test:e2e e2e/audiencia.spec.ts`
Expected: FAIL no teste do inquilino, com `toHaveCount` recebendo 4 em vez de 3.

Depois **desfazer a troca** e rodar de novo.
Expected: 3 passed.

⚠️ Se o teste do inquilino continuar PASSANDO com a audiência alargada, a suíte
não está medindo nada — provavelmente o `beforeAll` reusou um ambiente antigo.
Parar e investigar antes de seguir: um teste de vazamento que não pega o
vazamento é pior que teste nenhum, porque dá confiança falsa.

Sem este passo, não se sabe se a suíte pegaria o vazamento que ela existe para pegar.

- [ ] **Step 6: Commit**

```bash
git add e2e/support/portal.ts e2e/audiencia.spec.ts
git commit -m "test(e2e): a matriz de audiência, com contagem exata por papel"
```

---

### Task 4: Download cruzado por id devolve 404

**Files:**
- Create: `e2e/download-cruzado.spec.ts`

**Interfaces:**
- Consumes: `criarAmbiente`, `apagarAmbiente`, `Ambiente` da Task 2;
  `entrarNoPortal` da Task 3.
- Produces: nada.

- [ ] **Step 1: Escrever o teste**

Criar `e2e/download-cruzado.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { entrarNoPortal } from './support/portal'

/**
 * Esconder o documento da lista não basta: o id viaja na URL e quem trocou o id
 * na mão não passa pela tela.
 *
 * A asserção é **404, não 403**, e a diferença é o ponto. Um 403 confirmaria que
 * aquele documento existe — é a decisão registrada no comentário do
 * `download.post.ts`, e é exatamente o tipo de coisa que alguém "corrige" para
 * 403 por achar mais semântico.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('o inquilino não baixa o extrato do proprietário nem sabendo o id', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  // A chamada sai do contexto da página logada: leva o token do inquilino, que é
  // o cenário real. Um `request.post` fora do browser não levaria sessão nenhuma
  // e devolveria 401, provando outra coisa.
  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.extrato)

  expect(status).toBe(404)
})

test('o rascunho não é baixável nem por quem é a audiência dele', async ({ page }) => {
  // O rascunho é endereçado ao inquilino, mas `published_at` é nulo. É o caso em
  // que a audiência bate e mesmo assim tem que recusar.
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.rascunho)

  expect(status).toBe(404)
})

test('o documento dele baixa', async ({ page }) => {
  // O contraponto: sem ele, os dois testes acima passariam com o endpoint
  // quebrado devolvendo 404 para tudo.
  await entrarNoPortal(page, amb.slug, amb.inquilino)

  const status = await page.evaluate(async (docId) => {
    const sb = JSON.parse(localStorage.getItem('imob-portal-auth') || '{}')
    const r = await fetch(`/api/portal/documentos/${docId}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sb.access_token}` },
    })
    return r.status
  }, amb.documentos.boleto)

  expect(status).toBe(200)
})
```

- [ ] **Step 2: Rodar e ver falhar ou passar, e entender qual**

Run: `pnpm test:e2e e2e/download-cruzado.spec.ts`

Se os três passarem de primeira, **confirmar que o teste sabe falhar**: em
`server/api/portal/documentos/[id]/download.post.ts`, trocar o `404` do
`canClientSeeDocument` por `403`, rodar, ver o primeiro teste falhar, e desfazer.

A leitura do token no `localStorage` é o ponto frágil: se a chave
`imob-portal-auth` mudar de formato, os três viram 401 em vez de 404/200. O
terceiro teste é o que denuncia isso — 401 onde se espera 200.

- [ ] **Step 3: Commit**

```bash
git add e2e/download-cruzado.spec.ts
git commit -m "test(e2e): download por id alheio devolve 404, não 403"
```

---

### Task 5: A tela de definir senha, pelo token de verdade

**Files:**
- Create: `e2e/definir-senha.spec.ts`
- Modify: `e2e/support/tenant.ts` (acrescentar `tokensDeConvite` ao fim)

**Interfaces:**
- Consumes: `service`, `criarAmbiente`, `apagarAmbiente`, `Ambiente` da Task 2.
- Produces: `tokensDeConvite(email: string): Promise<{ accessToken: string; refreshToken: string }>`

- [ ] **Step 1: Acrescentar os helpers a `e2e/support/tenant.ts`**

No fim do arquivo:

```ts
/**
 * Troca um link de convite por tokens de sessão, do lado do servidor.
 *
 * Existe para a tela `definir-senha` ser exercitada de verdade sem depender de
 * e-mail nem da allowlist de Redirect URLs do Supabase — que é configuração fora
 * deste repositório e apontaria para o domínio do tenant, não para o localhost.
 *
 * `generateLink` devolve o `hashed_token`; `verifyOtp` o troca por sessão. Com os
 * dois tokens em mãos, a página é aberta no ramo `tipo === 'tokens'`, que é o
 * mesmo caminho do fluxo implícito real.
 */
export async function tokensDeConvite(
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const sb = service()
  const { data, error } = await sb.auth.admin.generateLink({ type: 'invite', email })
  if (error || !data.properties?.hashed_token) {
    throw new Error(`não gerou o convite de ${email}: ${error?.message}`)
  }

  const { data: sessao, error: erroOtp } = await sb.auth.verifyOtp({
    type: 'invite',
    token_hash: data.properties.hashed_token,
  })
  if (erroOtp || !sessao.session) {
    throw new Error(`não trocou o token de ${email}: ${erroOtp?.message}`)
  }

  return {
    accessToken: sessao.session.access_token,
    refreshToken: sessao.session.refresh_token,
  }
}
```

- [ ] **Step 2: Escrever o teste**

Criar `e2e/definir-senha.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, tokensDeConvite, type Ambiente } from './support/tenant'

/**
 * A tela de primeiro acesso, exercitada uma vez — no fiador.
 *
 * Uma vez porque a tela é a mesma para os três papéis e repetir provaria o mesmo
 * três vezes. No fiador porque é o papel cujo cadastro nasce inteiro dentro do
 * teste.
 *
 * O que ela precisa dizer está no `c7225e8`: o título nomeia QUAL acesso está
 * sendo criado. Ela é gêmea de `/admin/definir-senha`, e um convite que caísse na
 * errada era indistinguível do certo — a pessoa preenchia a senha inteira antes
 * de descobrir.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('o fiador define a senha e entra', async ({ page }) => {
  const { accessToken, refreshToken } = await tokensDeConvite(amb.fiador.email)

  await page.goto(
    `/area-cliente/definir-senha?tenant=${amb.slug}#access_token=${accessToken}&refresh_token=${refreshToken}`,
  )

  // O título tem que dizer que é a Área do Cliente, não só "Definir sua senha".
  await expect(page.getByRole('heading', { name: /Área do Cliente/ })).toBeVisible()

  const novaSenha = `E2e!${Date.now()}`
  await page.locator('#senha').fill(novaSenha)
  await page.locator('#confirma').fill(novaSenha)
  await page.getByRole('button', { name: /Definir senha e entrar/ }).click()

  await expect(page.getByRole('heading', { name: 'Meus contratos' })).toBeVisible()
})

test('a credencial some da barra de endereço', async ({ page }) => {
  // Sem o `history.replaceState`, o token fica no histórico e em qualquer print
  // que a pessoa mandar pedindo ajuda.
  const { accessToken, refreshToken } = await tokensDeConvite(amb.proprietario.email)

  await page.goto(
    `/area-cliente/definir-senha?tenant=${amb.slug}#access_token=${accessToken}&refresh_token=${refreshToken}`,
  )
  await expect(page.locator('#senha')).toBeVisible()
  expect(page.url()).not.toContain('access_token')
})

test('sem token, a tela explica em vez de girar', async ({ page }) => {
  await page.goto(`/area-cliente/definir-senha?tenant=${amb.slug}`)
  await expect(page.getByText(/não é mais válido/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Ir para o login/ })).toBeVisible()
})
```

- [ ] **Step 3: Rodar**

Run: `pnpm test:e2e e2e/definir-senha.spec.ts`
Expected: 3 passed. Se o primeiro falhar por timeout na sessão, o suspeito é
`detectSessionInUrl: false` no client do portal — que é intencional, e por isso a
página consome o fragmento explicitamente. Conferir que a URL do `goto` usa `#` e
não `?`.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/tenant.ts e2e/definir-senha.spec.ts
git commit -m "test(e2e): definir senha pelo token, sem e-mail nem allowlist"
```

---

### Task 6: A imobiliária publicando — a audiência decidida na tela

**Files:**
- Create: `e2e/support/painel.ts`
- Create: `e2e/fixtures/documento.pdf`
- Create: `e2e/publicacao.spec.ts`

**Interfaces:**
- Consumes: `criarAmbiente`, `apagarAmbiente`, `Ambiente`, `Conta` da Task 2;
  `entrarNoPortal` da Task 3.
- Produces: `entrarNoPainel(page, slug, membro): Promise<void>`

- [ ] **Step 1: Criar o PDF de fixture**

```bash
mkdir -p e2e/fixtures
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF' > e2e/fixtures/documento.pdf
```

- [ ] **Step 2: Escrever o helper de login do painel**

Criar `e2e/support/painel.ts`:

```ts
import { expect, type Page } from '@playwright/test'
import type { Conta } from './tenant'

/**
 * Entra no painel da imobiliária.
 *
 * Client Supabase diferente do portal, com `storageKey` próprio
 * (`imob-admin-auth` contra `imob-portal-auth`) — o que impede uma sessão
 * derrubar a outra no mesmo navegador. Aqui isso importa na prática: os testes
 * de publicação abrem as duas.
 */
export async function entrarNoPainel(page: Page, slug: string, membro: Conta): Promise<void> {
  await page.goto(`/admin/login?tenant=${slug}`)
  await page.locator('#email').fill(membro.email)
  await page.locator('#pass').fill(membro.senha)
  await page.getByRole('button', { name: /Entrar/ }).click()
  await expect(page).toHaveURL(/\/admin(\?|$)/)
}
```

- [ ] **Step 3: Escrever o teste**

Criar `e2e/publicacao.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { entrarNoPainel } from './support/painel'
import { entrarNoPortal } from './support/portal'

/**
 * O único upload que passa pela interface, e o de maior aposta.
 *
 * A imobiliária é quem CLASSIFICA o documento, e a classificação decide quem
 * enxerga. Por isso a consequência tem que estar visível no momento da escolha —
 * é a razão de `describeAudience` existir, e é o que este teste fixa.
 *
 * O contrato de administração é o caso em que errar a caixinha expõe a taxa de
 * administração, a conta bancária e o Pix pessoal do proprietário ao inquilino.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('a tela diz quem vai ver antes de publicar, e o portal obedece', async ({ page }) => {
  await entrarNoPainel(page, amb.slug, amb.membro)
  await page.goto(`/admin/contratos/${amb.contratoId}?tenant=${amb.slug}`)

  await page.locator('#arq').setInputFiles('e2e/fixtures/documento.pdf')
  await page.locator('#cat').selectOption('contrato_administracao')
  await page.locator('#tit').fill('Administração E2E')

  // A frase, ANTES de enviar. Um rótulo que descreve a regra antiga é pior que
  // rótulo nenhum, porque quem leu confiou.
  await expect(page.locator('p.regra b')).toHaveText('Só o proprietário vê.')

  await page.getByRole('button', { name: 'Enviar documento' }).click()
  await expect(page.getByText('Administração E2E')).toBeVisible()

  // Nasce rascunho: publicar é ato separado.
  const linha = page.locator('li', { hasText: 'Administração E2E' })
  await expect(linha).toContainText('rascunho')
  await linha.getByRole('button', { name: 'Publicar' }).click()
  await expect(linha).not.toContainText('rascunho')
})

test('publicado, o proprietário vê e o inquilino não', async ({ page }) => {
  await entrarNoPortal(page, amb.slug, amb.proprietario)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()
  await expect(page.getByText('Administração E2E')).toBeVisible()

  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())

  await entrarNoPortal(page, amb.slug, amb.inquilino)
  await page.getByRole('link', { name: /Rua de Teste/ }).click()
  await expect(page.getByText('Administração E2E')).toHaveCount(0)
})
```

- [ ] **Step 4: Rodar e ver falhar pelo motivo certo**

Run: `pnpm test:e2e e2e/publicacao.spec.ts`
Expected: a falha provável é no seletor `p.regra b` ou no texto exato da frase.
Conferir o texto com `describeAudience(['proprietario'])`, que devolve
`Só o proprietário vê` — o ponto final vem do template, não da função.

- [ ] **Step 5: Provar que a frase está ligada na regra**

Em `shared/utils/portal-access.ts`, trocar o `defaultAudienceFor` de
`contrato_administracao` para `['inquilino', 'proprietario']`, rodar, e conferir
que o primeiro teste falha na frase **e** o segundo falha no portal. Desfazer.

É o que prova que a tela e o portal leem a mesma regra — o objetivo do arquivo.

- [ ] **Step 6: Commit**

```bash
git add e2e/support/painel.ts e2e/fixtures e2e/publicacao.spec.ts
git commit -m "test(e2e): a audiência decidida na tela é a que o portal aplica"
```

---

### Task 7: Acesso desativado e recurso desligado

**Files:**
- Create: `e2e/acesso-negado.spec.ts`

**Interfaces:**
- Consumes: `criarAmbiente`, `apagarAmbiente`, `Ambiente` da Task 2; `service` da
  Task 2; `entrarNoPortal` da Task 3.
- Produces: nada.

- [ ] **Step 1: Escrever o teste**

Criar `e2e/acesso-negado.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { apagarAmbiente, criarAmbiente, type Ambiente } from './support/tenant'
import { service } from './support/supabase'
import { entrarNoPortal } from './support/portal'

/**
 * As duas recusas que precisam dizer o que fazer, não o que falhou.
 *
 * "Erro ao autenticar" depois de uma senha CERTA é o que faz o inquilino ligar
 * para a imobiliária — e a imobiliária ligar para nós.
 */
let amb: Ambiente

test.beforeAll(async () => {
  amb = await criarAmbiente()
})

test.afterAll(async () => {
  await apagarAmbiente(amb.slug)
})

test('acesso desativado manda falar com a imobiliária', async ({ page }) => {
  await service()
    .from('portal_users')
    .update({ active: false })
    .eq('id', amb.inquilino.portalUserId)

  await page.goto(`/area-cliente/login?tenant=${amb.slug}`)
  await page.locator('#email').fill(amb.inquilino.email)
  await page.locator('#senha').fill(amb.inquilino.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('alert')).toContainText(/desativado/)
  await expect(page.getByRole('alert')).toContainText(/imobiliária/)

  await service()
    .from('portal_users')
    .update({ active: true })
    .eq('id', amb.inquilino.portalUserId)
})

test('recurso desligado explica sem falar de pagamento', async ({ page }) => {
  // A mensagem NÃO menciona pagamento por decisão registrada: expor a
  // inadimplência da imobiliária aos clientes DELA é dano à imagem de terceiro.
  // É fácil de regredir "melhorando" a mensagem, e é por isso que está aqui.
  await entrarNoPortal(page, amb.slug, amb.proprietario)

  await service()
    .from('tenant_features')
    .update({ enabled: false })
    .eq('tenant_id', amb.tenantId)
    .eq('feature', 'portal')

  await page.reload()

  const corpo = await page.locator('body').innerText()
  expect(corpo).not.toMatch(/pagamento|fatura|inadimpl|cobran/i)

  await service()
    .from('tenant_features')
    .update({ enabled: true })
    .eq('tenant_id', amb.tenantId)
    .eq('feature', 'portal')
})
```

- [ ] **Step 2: Rodar**

Run: `pnpm test:e2e e2e/acesso-negado.spec.ts`
Expected: 2 passed. Se o segundo falhar por a página ainda mostrar os contratos,
o suspeito é o cache de tenant de 10 minutos em `server/utils/cache.ts` — neste
caso, trocar o `reload` por uma navegação que force nova resolução, ou aceitar que
a asserção só vale depois do cache expirar e documentar isso no teste.

- [ ] **Step 3: Rodar a suíte inteira**

```bash
pnpm test:e2e
```

Expected: todos os arquivos verdes.

- [ ] **Step 4: Confirmar que o banco ficou limpo**

No SQL Editor:

```sql
select slug from public.tenants where slug like 'e2e-%';
select count(*) from auth.users where email like '%@e2e.invalid';
```

Expected: nenhuma linha no primeiro; zero no segundo.

- [ ] **Step 5: Commit**

```bash
git add e2e/acesso-negado.spec.ts
git commit -m "test(e2e): as duas recusas dizem o que fazer, e sem citar pagamento"
```

---

## Depois do plano

Atualizar o `CLAUDE.md` na seção **Comandos**, acrescentando:

```
pnpm test:e2e     # Playwright, sobe o app — minutos, não segundos. Roda sob demanda.
```

E na seção **Testes**, uma linha dizendo que o E2E existe, que vive fora do
`pnpm test` de propósito, e que cada execução cria e apaga um tenant `e2e-*` no
mesmo projeto Supabase de produção.
