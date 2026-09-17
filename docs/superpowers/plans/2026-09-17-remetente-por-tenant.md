# Remetente de e-mail por imobiliária — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o `From` do e-mail transacional passa a sair do domínio da própria
imobiliária quando ela tem um configurado, e do domínio da plataforma quando não
tem.

**Architecture:** uma tabela `tenant_mail_sender` sem policy de escrita (só quem
vende grava, via service role), lida por uma fonte única
`remetenteDoTenant(tenant)` que cai no `MAIL_FROM` em qualquer falha. O
`Remetente` do mailer ganha o campo `endereco`, e os dois caminhos de envio
passam a resolvê-lo antes de chamar `enviarEmail`.

**Tech Stack:** Nuxt 4 / Nitro, Supabase (Postgres + RLS), TypeScript, Vitest em
Node puro.

**Spec:** [docs/superpowers/specs/2026-09-17-remetente-por-tenant-design.md](../specs/2026-09-17-remetente-por-tenant-design.md)

**Branch:** `claude/remetente-por-tenant`

## Como retomar isto de outra sessão

O estado desta implementação mora no **git**, não na conversa. Não existe nada
para recuperar de uma sessão anterior além do que está abaixo.

```bash
git fetch origin claude/remetente-por-tenant
git checkout claude/remetente-por-tenant
pnpm install
```

**Onde parei:** a primeira caixa `- [ ]` não marcada, de cima para baixo. As
marcadas (`- [x]`) já foram feitas e commitadas — cada tarefa termina num commit
próprio, então `git log --oneline` confirma o que a marcação diz.

**Antes de continuar,** rode `pnpm typecheck && pnpm test` para confirmar que a
árvore está verde. Se não estiver, a última tarefa ficou pela metade: leia o
diff do `git status` antes de seguir, porque o plano supõe que cada tarefa
começa a partir de uma árvore limpa.

**Se a marcação e o `git log` discordarem**, o `git log` tem razão — a marcação
é commitada junto com a tarefa, então a divergência só acontece se alguém editou
o plano à mão.

**Destino do merge é decisão em aberto.** Esta branch saiu da `develop` (que já
contém a `main`). Levá-la para a `main` por PR arrastaria junto todo o trabalho
que só existe na `develop` — PWA do painel, "Quem somos", endereço estruturado.
Decida no fim: merge na `develop`, ou rebase em cima da `main` para um PR limpo.

## Global Constraints

- **Idioma:** comentários, mensagens de commit e nomes de domínio em português;
  identificadores de código em inglês.
- **Comentário explica POR QUÊ**, com a alternativa descartada e o custo dela.
  Comentário que narra o código (`// valida o endereço`) não entra.
- **Migration idempotente** (`if not exists`, `drop policy if exists` antes de
  `create policy`), com comentário no topo explicando o sintoma que ela corrige.
- **Tabela de dado interno leva `revoke ... from anon`** — a policy sozinha não
  basta, porque o Supabase dá GRANT default ao anon.
- **Validação completa:** `pnpm typecheck && pnpm test`. Não existe script de
  lint.
- **Repository nunca devolve row cru** e **o client do Supabase entra por
  parâmetro** — as duas regras do CLAUDE.md. `remetenteDoTenant` é exceção
  consciente: é `server/utils/`, não repository, e segue o
  [`entitlement.ts`](../../../server/utils/entitlement.ts), que chama
  `serviceSupabase()` internamente pelo mesmo motivo (ele É a fonte única; receber
  o client permitiria chamá-lo com o client errado).
- **Nada de `serviceSupabase()` novo dentro de `server/api/portal/`** — há um
  guardrail que varre aquela pasta
  ([portal-payload-guardrail.test.ts:80](../../../test/server/portal-payload-guardrail.test.ts)).
  Esta mudança não precisa: o `serviceSupabase()` fica em `server/utils/mail-sender.ts`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0038_tenant_mail_sender.sql` | a tabela, a policy de leitura e os revokes |
| `supabase/migrations/rollback/0038_rollback.sql` | desfaz |
| `shared/types/database.types.ts` | tipo da tabela nova |
| `server/utils/mail-sender.ts` | **fonte única**: de qual endereço sai o e-mail deste tenant |
| `server/utils/mailer.ts` | `Remetente.endereco` + `enderecoDeEnvio` (validação pura) |
| `server/repositories/portal-invite.repository.ts` | recebe o `Remetente` pronto em vez de nome/e-mail soltos |
| `server/api/admin/portal-users.post.ts` | resolve o remetente e passa |
| `server/api/portal/recuperar-senha.post.ts` | idem |
| `test/server/remetente-por-tenant.test.ts` | testes desta feature |

---

### Task 1: A tabela, sem policy de escrita

**Files:**
- Create: `supabase/migrations/0038_tenant_mail_sender.sql`
- Create: `supabase/migrations/rollback/0038_rollback.sql`
- Modify: `shared/types/database.types.ts`
- Test: `test/server/remetente-por-tenant.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `public.tenant_mail_sender (tenant_id uuid pk, from_address text not null, notes text, created_at timestamptz, updated_at timestamptz)`; tipo
  `Database['public']['Tables']['tenant_mail_sender']`.

- [ ] **Step 1: Write the failing test**

Crie `test/server/remetente-por-tenant.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0038_tenant_mail_sender.sql',
)

describe('a tabela do remetente não é gravável pela imobiliária', () => {
  /**
   * Os dois domínios estão verificados na MESMA conta Resend, então quem
   * controla o endereço de envio manda e-mail como o outro cliente — com SPF e
   * DKIM passando. É pior que phishing comum, porque autentica.
   */
  const sql = () => readFileSync(MIGRATION, 'utf8')

  test('a única policy é de leitura', () => {
    const fonte = sql()
    expect(fonte).toContain('for select to authenticated')
    // `for all` é o padrão de quase todas as outras tabelas deste schema, e é
    // exatamente por isso que o teste existe: acrescentar uma aqui, por hábito,
    // abriria a escrita sem ninguém ter decidido isso.
    expect(fonte).not.toContain('for all')
    expect(fonte).not.toMatch(/for (insert|update|delete)/)
  })

  test('o revoke é explícito, não implícito', () => {
    // A 0036 já registrou o porquê: sem o revoke, a proteção depende de ninguém
    // acrescentar uma policy permissiva depois. Não há erro e não há sintoma.
    const fonte = sql()
    expect(fonte).toContain('revoke insert, update, delete, truncate on public.tenant_mail_sender from authenticated')
    expect(fonte).toContain('revoke all on public.tenant_mail_sender from anon')
  })

  test('é idempotente', () => {
    const fonte = sql()
    expect(fonte).toContain('create table if not exists')
    expect(fonte).toContain('drop policy if exists')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... 0038_tenant_mail_sender.sql`

- [ ] **Step 3: Write the migration**

Crie `supabase/migrations/0038_tenant_mail_sender.sql`:

```sql
-- De qual endereço sai o e-mail desta imobiliária.
--
-- O `mailer.ts` tinha UM remetente global: o endereço vinha de
-- `config.mailFrom`, igual para todos os tenants. O plano em que a OLMI se
-- encaixa prevê domínio dedicado, e `olmiimoveis.com.br` já estava verificado
-- na conta Resend — a verificação estava lá sem ninguém usar, porque o e-mail
-- dela continuava saindo como `OLMI IMÓVEIS <nao-responda@usemoradi.com.br>`.
--
-- ⚠️ POR QUE UMA TABELA, E NÃO UMA COLUNA. As duas alternativas naturais
-- entregam o endereço de envio à própria imobiliária:
--
--   - coluna em `tenants`: a tabela tem `tenants_member_update` e NUNCA recebeu
--     `revoke update` de coluna. A coluna nasceria gravável pelo membro, e o
--     whitelist de `toTenantUpdateRow` protege o caminho do app, não o banco;
--   - derivar de `tenant_domains.is_primary`: `tenant_domains_member_write` é
--     `for all` para qualquer membro. O que hoje impede pegar o domínio alheio
--     é o `domain text unique` — constraint de roteamento fazendo autorização
--     por acidente.
--
-- E isso importa porque os domínios de TODOS os clientes vivem na mesma conta
-- Resend: quem controla o endereço de envio manda e-mail como o outro cliente,
-- com SPF e DKIM passando. Autentica.
--
-- Por isso: leitura para o membro, escrita para ninguém. Quem vende grava, por
-- service role — mesma postura da `tenant_features`.
--
-- Ausência de linha = domínio da plataforma. Tenant novo não ganha remetente
-- próprio por esquecimento.
--
-- Idempotente: seguro rodar de novo.

create table if not exists public.tenant_mail_sender (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  from_address text not null,
  -- Para quem vende anotar o contexto (qual plano, quando foi verificado na
  -- Resend). Não é lido pela aplicação.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_mail_sender is
  'Endereço do From por imobiliária. Escrita SÓ pela service role — a imobiliária não escolhe de qual domínio o e-mail dela sai. Ver server/utils/mail-sender.ts.';
comment on column public.tenant_mail_sender.from_address is
  'Endereço completo, ex.: nao-responda@olmiimoveis.com.br. O domínio precisa estar verificado na conta do provedor, senão o envio falha com 502 e mail.falhou no log.';

alter table public.tenant_mail_sender enable row level security;

-- O painel pode querer exibir de onde o e-mail dele sai. Só isso.
drop policy if exists "tenant_mail_sender_member_read" on public.tenant_mail_sender;
create policy "tenant_mail_sender_member_read" on public.tenant_mail_sender
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- ⚠️ O revoke NÃO é redundante com a ausência de policy. A 0036 registrou o
-- motivo: sem ele a proteção é implícita, e no dia em que alguém acrescentar
-- uma policy permissiva a escrita passa a ser permitida sem decisão. Não há
-- erro e não há sintoma.
revoke insert, update, delete, truncate on public.tenant_mail_sender from authenticated;
revoke all on public.tenant_mail_sender from anon;

drop trigger if exists trg_tenant_mail_sender_updated on public.tenant_mail_sender;
create trigger trg_tenant_mail_sender_updated before update on public.tenant_mail_sender
  for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Write the rollback**

Crie `supabase/migrations/rollback/0038_rollback.sql`:

```sql
-- Rollback da 0038.
--
-- ⚠️ Apaga a configuração de remetente de todos os tenants. Quem tinha domínio
-- dedicado volta a enviar pelo domínio da plataforma — o código já faz isso
-- sozinho quando não há linha, então o rollback do banco não exige rollback do
-- app. Mas a informação de QUAL era o endereço se perde: anote antes.

drop table if exists public.tenant_mail_sender;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 6: Add the table type**

Em `shared/types/database.types.ts`, dentro de `public.Tables`: **logo depois do
bloco `tenant_features` e antes de `tenant_domains`**. (O arquivo não está em
ordem alfabética — `tenant_domains` vem depois de `tenant_features` —, então não
tente reordenar nada; só insira ali.)

```ts
      tenant_mail_sender: {
        Row: {
          created_at: string
          from_address: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_address: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_address?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_mail_sender_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 7: Verify the whole suite and the types**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck sem erro novo, todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0038_tenant_mail_sender.sql supabase/migrations/rollback/0038_rollback.sql shared/types/database.types.ts test/server/remetente-por-tenant.test.ts
git commit -m "feat(email): tabela do remetente por imobiliária, sem policy de escrita"
```

---

### Task 2: `remetenteDoTenant` — a fonte única

**Files:**
- Create: `server/utils/mail-sender.ts`
- Test: `test/server/remetente-por-tenant.test.ts` (acrescenta um `describe`)

**Interfaces:**
- Consumes: tabela e tipo da Task 1.
- Produces: `remetenteDoTenant(tenant: Tenant): Promise<string>` — devolve o
  `from_address` do tenant, ou `useRuntimeConfig().mailFrom` quando não há linha
  **ou** quando a leitura falha.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/server/remetente-por-tenant.test.ts` (o import de
`remetenteDoTenant` vai no topo do arquivo, junto dos outros):

```ts
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import type { Tenant } from '~~/shared/models/tenant'

const PLATAFORMA = 'nao-responda@usemoradi.com.br'

/**
 * `serviceSupabase` e `useRuntimeConfig` são auto-imports do Nitro, e o vitest
 * aqui roda em Node puro, sem o Nuxt (ver `vitest.config.ts`). O `test/setup.ts`
 * já registra `createError` e os logs no `globalThis` pelo mesmo motivo — estes
 * dois são registrados por teste porque cada caso precisa de uma resposta
 * diferente do banco.
 */
function comBanco(
  resposta: { data: { from_address: string } | null; error: { message: string } | null },
  opts: { lanca?: boolean } = {},
) {
  const eventos: string[] = []
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ mailFrom: PLATAFORMA }),
    serviceSupabase: () => {
      if (opts.lanca) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente')
      return {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => resposta }),
          }),
        }),
      }
    },
    logWarn: (evento: string) => { eventos.push(evento) },
    logError: (evento: string) => { eventos.push(evento) },
  })
  return eventos
}

const TENANT = { id: 't1', slug: 'olmi', email: 'contato@olmi.com.br' } as Tenant

describe('remetenteDoTenant', () => {
  test('devolve o endereço dedicado quando há linha', async () => {
    comBanco({ data: { from_address: 'nao-responda@olmiimoveis.com.br' }, error: null })
    expect(await remetenteDoTenant(TENANT)).toBe('nao-responda@olmiimoveis.com.br')
  })

  test('sem linha, cai na plataforma', async () => {
    // Ausência = domínio da plataforma. Tenant novo não ganha remetente próprio
    // por esquecimento.
    comBanco({ data: null, error: null })
    expect(await remetenteDoTenant(TENANT)).toBe(PLATAFORMA)
  })

  test('erro de leitura cai na plataforma E deixa rastro', async () => {
    // Diferença deliberada em relação ao `entitlement.ts`, que falha fechado:
    // lá a alternativa é entregar algo que não foi comprado; aqui, falhar
    // fechado é não mandar o convite. E-mail do domínio da plataforma é pior
    // que o dedicado e infinitamente melhor que e-mail nenhum.
    //
    // O log é metade da regra: cair na plataforma em silêncio faria o cliente
    // enviar do domínio errado por semanas sem ninguém ver.
    const eventos = comBanco({ data: null, error: { message: 'permission denied' } })
    expect(await remetenteDoTenant(TENANT)).toBe(PLATAFORMA)
    expect(eventos).toContain('remetente.leitura_falhou')
  })

  test('serviceSupabase lançando não derruba o envio', async () => {
    // `serviceSupabase()` lança quando a chave não está configurada.
    const eventos = comBanco({ data: null, error: null }, { lanca: true })
    expect(await remetenteDoTenant(TENANT)).toBe(PLATAFORMA)
    expect(eventos).toContain('remetente.leitura_falhou')
  })

  test('avisa quando há remetente dedicado e nenhum Reply-To', async () => {
    // O apex de olmiimoveis.com.br não tem MX. Com o From parecendo da
    // imobiliária, responder fica natural — e sem `tenant.email` não vai
    // `Reply-To`, então a resposta bounce em silêncio.
    const avisos = comBanco({
      data: { from_address: 'nao-responda@olmiimoveis.com.br' },
      error: null,
    })
    await remetenteDoTenant({ ...TENANT, email: null } as Tenant)
    expect(avisos).toContain('remetente.dedicado_sem_reply_to')
  })

  test('sem dedicado NÃO avisa, mesmo sem Reply-To', async () => {
    // O From é @usemoradi.com.br e ninguém responde para lá: o aviso seria ruído
    // em todo tenant que não tem e-mail cadastrado.
    const avisos = comBanco({ data: null, error: null })
    await remetenteDoTenant({ ...TENANT, email: null } as Tenant)
    expect(avisos).not.toContain('remetente.dedicado_sem_reply_to')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: FAIL — `Failed to resolve import "~~/server/utils/mail-sender"`

- [ ] **Step 3: Write the implementation**

Crie `server/utils/mail-sender.ts`:

```ts
import type { Tenant } from '~~/shared/models/tenant'

/**
 * De qual endereço sai o e-mail desta imobiliária.
 *
 * Fonte única, no molde do `entitlement.ts`. Existe para não haver duas
 * leituras de `tenant_mail_sender` com tratamentos de erro diferentes — e para
 * que o caminho de envio não precise saber que existe uma tabela.
 *
 * ⚠️ **Falha para o lado ABERTO, ao contrário do `entitlement.ts`, e a diferença
 * é deliberada.** Lá o recurso pago erra para "não oferecer", porque a
 * alternativa é entregar algo que não foi comprado. Aqui, falhar fechado seria
 * não enviar o convite: um e-mail saindo do domínio da plataforma é pior que o
 * dedicado e infinitamente melhor que e-mail nenhum.
 *
 * Recebe o `Tenant` e não o id: o aviso de Reply-To abaixo depende do
 * `tenant.email`, e uma assinatura por id obrigaria a segunda consulta ou
 * jogaria o aviso para o chamador, onde se repetiria nos dois caminhos de envio.
 *
 * Service role porque `tenant_mail_sender` não tem policy de escrita e é lida
 * fora de qualquer sessão de usuário (a recuperação de senha é pública).
 */
export async function remetenteDoTenant(tenant: Tenant): Promise<string> {
  const plataforma = useRuntimeConfig().mailFrom || ''

  try {
    const { data, error } = await serviceSupabase()
      .from('tenant_mail_sender')
      .select('from_address')
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (error) {
      logError('remetente.leitura_falhou', { tenant: tenant.slug, reason: error.message })
      return plataforma
    }

    const dedicado = (data?.from_address || '').trim()
    if (!dedicado) return plataforma

    // ⚠️ O apex do domínio dedicado costuma não ter MX — só o subdomínio de
    // bounce do provedor tem. Enquanto o From era `@usemoradi.com.br` ninguém
    // respondia para lá; com ele parecendo da imobiliária, responder fica
    // natural, e o rodapé do convite manda responder. Sem `tenant.email` não vai
    // `Reply-To` e a resposta bounce sem deixar rastro.
    //
    // Não bloqueia o envio: transforma um bounce silencioso em linha de log.
    if (!tenant.email) {
      logWarn('remetente.dedicado_sem_reply_to', { tenant: tenant.slug })
    }

    return dedicado
  } catch (e) {
    // `serviceSupabase()` lança quando a chave não está configurada. Sem este
    // catch, uma variável de ambiente ausente derrubaria o convite inteiro em
    // vez de mandá-lo pelo domínio da plataforma.
    logError('remetente.leitura_falhou', { tenant: tenant.slug, reason: errMessage(e) })
    return plataforma
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: PASS (9 testes — 3 da Task 1, 6 desta)

- [ ] **Step 5: Commit**

```bash
git add server/utils/mail-sender.ts test/server/remetente-por-tenant.test.ts
git commit -m "feat(email): fonte única do remetente por tenant, que falha para a plataforma"
```

---

### Task 3: `Remetente` ganha o endereço, e o endereço é validado

**Files:**
- Modify: `server/utils/mailer.ts`
- Test: `test/server/mailer.test.ts`

**Interfaces:**
- Consumes: nada da Task 2 (o mailer não conhece a tabela; recebe o endereço
  pronto).
- Produces:
  - `interface Remetente { nome: string; endereco: string; replyTo: string | null }`
  - `enderecoDeEnvio(endereco: string | null | undefined, fallback: string): string`

- [ ] **Step 1: Write the failing test**

Acrescente a `test/server/mailer.test.ts` (e inclua `enderecoDeEnvio` no import
que já existe no topo do arquivo, vindo de `~~/server/utils/mailer`):

```ts
describe('enderecoDeEnvio', () => {
  const FALLBACK = 'nao-responda@usemoradi.com.br'

  test('aceita o endereço dedicado', () => {
    expect(enderecoDeEnvio('nao-responda@olmiimoveis.com.br', FALLBACK)).toBe(
      'nao-responda@olmiimoveis.com.br',
    )
  })

  test('vazio ou nulo cai no fallback', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(enderecoDeEnvio(v, FALLBACK)).toBe(FALLBACK)
    }
  })

  test('recusa quebra de linha — o vetor de injeção de cabeçalho', () => {
    // `montarFrom` já limpa o NOME. O endereço nunca precisou disso porque era
    // constante de configuração; virando dado de linha, precisa da mesma
    // validação. Um `\r\n` aqui acrescenta um `Bcc:` ao e-mail.
    expect(enderecoDeEnvio('x@y.com\r\nBcc: alguem@exemplo.com', FALLBACK)).toBe(FALLBACK)
  })

  test('recusa o que quebra a sintaxe de `Nome <endereco>`', () => {
    for (const v of ['a<b@y.com', 'a>b@y.com', 'a"b@y.com', 'a;b@y.com', 'a,b@y.com']) {
      expect(enderecoDeEnvio(v, FALLBACK), v).toBe(FALLBACK)
    }
  })

  test('recusa o que não é endereço', () => {
    for (const v of ['semarroba', 'sem@dominio', '@y.com', 'a@b']) {
      expect(enderecoDeEnvio(v, FALLBACK), v).toBe(FALLBACK)
    }
  })

  test('fallback vazio continua vazio — quem trata é o guard de configuração', () => {
    // `enviarEmail` erra alto em produção quando não há remetente nenhum. Esta
    // função não inventa um endereço para esconder isso.
    expect(enderecoDeEnvio('lixo', '')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/mailer.test.ts`
Expected: FAIL — `enderecoDeEnvio is not a function` (ou erro de import)

- [ ] **Step 3: Add `endereco` to the interface**

Em `server/utils/mailer.ts`, no `export interface Remetente`:

```ts
export interface Remetente {
  /** Nome de exibição: o nome da imobiliária. */
  nome: string
  /**
   * Endereço do `From`. Vem de `remetenteDoTenant` (server/utils/mail-sender.ts),
   * que já resolve dedicado vs. plataforma — este arquivo não conhece a tabela.
   */
  endereco: string
  /** Para onde vai a resposta do cliente: o e-mail real da imobiliária. */
  replyTo: string | null
}
```

- [ ] **Step 4: Add the pure validator**

No mesmo arquivo, logo depois de `replyToValido`:

```ts
/**
 * Endereço utilizável no cabeçalho `From`, ou o fallback.
 *
 * `montarFrom` limpa o NOME contra injeção de cabeçalho. O endereço nunca
 * precisou do mesmo cuidado porque era constante de configuração; desde que ele
 * passou a vir de `tenant_mail_sender`, é dado de linha — e uma quebra de linha
 * num `From` acrescenta um `Bcc:` e transforma o convite num disparo para
 * terceiros.
 *
 * Recusa em vez de limpar: um endereço "consertado" enviaria de um lugar que
 * ninguém escolheu. Cair no fallback manda do domínio da plataforma, que é
 * sempre um destino legítimo.
 */
const ENDERECO = /^[^@\s<>",;\\]+@[^@\s<>",;\\]+\.[^@\s<>",;\\]+$/

export function enderecoDeEnvio(
  endereco: string | null | undefined,
  fallback: string,
): string {
  const limpo = (endereco || '').trim()
  return ENDERECO.test(limpo) ? limpo : fallback
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/server/mailer.test.ts`
Expected: PASS

- [ ] **Step 6: Wire it into `enviarEmail`**

Em `server/utils/mailer.ts`, dentro de `enviarEmail`, substitua

```ts
  const remetenteEndereco = config.mailFrom
```

por

```ts
  // O endereço do tenant, com o da plataforma como fallback. Quem resolve qual
  // é qual é `remetenteDoTenant`; aqui só se valida o que chegou, porque é este
  // arquivo que monta o cabeçalho.
  const remetenteEndereco = enderecoDeEnvio(msg.remetente.endereco, config.mailFrom)
```

É a **única** linha que muda no corpo da função. A de baixo,
`const from = montarFrom(msg.remetente.nome, remetenteEndereco)`, já lê a
variável certa e fica como está.

O guard `if (!chave || !remetenteEndereco)` acima continua intacto: sem
dedicado **e** sem `MAIL_FROM`, `enderecoDeEnvio` devolve `''` e o erro alto em
produção segue valendo.

- [ ] **Step 7: Verify nothing else broke**

Run: `pnpm test`
Expected: os dois chamadores ainda não passam `endereco`, então o **typecheck**
vai reclamar — isso é esperado e é a Task 4. Os testes devem passar.

- [ ] **Step 8: Commit**

```bash
git add server/utils/mailer.ts test/server/mailer.test.ts
git commit -m "feat(email): o From passa a vir do Remetente, com o endereço validado"
```

---

### Task 4: Ligar os dois caminhos de envio

**Files:**
- Modify: `server/repositories/portal-invite.repository.ts`
- Modify: `server/api/admin/portal-users.post.ts`
- Modify: `server/api/portal/recuperar-senha.post.ts`
- Test: `test/server/remetente-por-tenant.test.ts` (acrescenta um `describe`)

**Interfaces:**
- Consumes: `remetenteDoTenant` (Task 2), `Remetente` com `endereco` (Task 3).
- Produces: `convidarClientePortal(service, tenantId, remetente: Remetente, input, redirectTo, urlPortal)` — **a assinatura muda**: os parâmetros
  `tenantNome: string` e `tenantEmail: string | null` saem e viram o objeto
  `remetente`.

**Por que a assinatura muda em vez de ganhar um parâmetro.** Ela já tem sete
posicionais. Acrescentar o endereço deixaria **três `string` adjacentes** —
nome, e-mail e endereço — e trocar dois deles de lugar não dá erro de tipo: o
convite sairia com o e-mail da imobiliária no lugar do nome, e ninguém
descobriria até um cliente reclamar. Passar o `Remetente`, que é o objeto que o
`enviarEmail` já consome, remove dois parâmetros e acrescenta um.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/server/remetente-por-tenant.test.ts`:

```ts
import { readFileSync as lerArquivo } from 'node:fs'

describe('os dois caminhos de envio usam a fonte única', () => {
  const fonte = (...p: string[]) => lerArquivo(join(process.cwd(), ...p), 'utf8')

  test('o convite resolve o remetente antes de chamar o repositório', () => {
    const f = fonte('server', 'api', 'admin', 'portal-users.post.ts')
    expect(f).toContain('remetenteDoTenant')
  })

  test('a recuperação de senha também', () => {
    const f = fonte('server', 'api', 'portal', 'recuperar-senha.post.ts')
    expect(f).toContain('remetenteDoTenant')
  })

  test('o caminho de envio não lê config.mailFrom por fora do fallback', () => {
    // A regra que some num refactor sem deixar erro: o código continua
    // enviando, só que do domínio errado — e o sintoma aparece semanas depois,
    // como "o e-mail não parece vir de nós".
    for (const p of [
      ['server', 'api', 'admin', 'portal-users.post.ts'],
      ['server', 'api', 'portal', 'recuperar-senha.post.ts'],
      ['server', 'repositories', 'portal-invite.repository.ts'],
    ]) {
      expect(fonte(...p), p.join('/')).not.toContain('mailFrom')
    }
  })

  test('o repositório recebe o Remetente pronto, não nome e e-mail soltos', () => {
    // Três `string` adjacentes numa assinatura posicional é troca silenciosa
    // esperando acontecer: o tipo não distingue nome de endereço.
    const f = fonte('server', 'repositories', 'portal-invite.repository.ts')
    expect(f).toContain('remetente: Remetente')
    expect(f).not.toContain('tenantNome')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: FAIL nos quatro testes deste `describe`.

- [ ] **Step 3: Change the repository signature**

Em `server/repositories/portal-invite.repository.ts`:

Acrescente ao topo, junto dos imports que já existem:

```ts
import type { Remetente } from '~~/server/utils/mailer'
```

Troque a assinatura de `convidarClientePortal`:

```ts
export async function convidarClientePortal(
  service: Client,
  tenantId: string,
  // O remetente inteiro, e não nome/e-mail soltos: a assinatura já tinha sete
  // posicionais, e um terceiro `string` adjacente tornaria uma troca de ordem
  // invisível para o compilador.
  remetente: Remetente,
  input: PortalUserInput,
  redirectTo: string,
  urlPortal: string,
): Promise<ResultadoConvite> {
```

Dentro do corpo, troque as três leituras:

- `nomeImobiliaria: tenantNome` → `nomeImobiliaria: remetente.nome` (são **três**
  ocorrências: nos casos 1, 2 e 3 da decisão do token);
- `remetente: { nome: tenantNome, replyTo: tenantEmail }` na chamada de
  `enviarEmail` → `remetente` (o objeto recebido, sem remontar).

- [ ] **Step 4: Update the invite endpoint**

Em `server/api/admin/portal-users.post.ts`, dentro do handler, depois de
`const origem = await portalOrigin(service, tenant)`:

```ts
  const remetente = {
    nome: tenant.name,
    endereco: await remetenteDoTenant(tenant),
    replyTo: tenant.email,
  }

  const resultado = await convidarClientePortal(
    service,
    tenant.id,
    remetente,
    body,
    urlDefinirSenha(origem),
    urlLoginPortal(origem),
  )
```

E acrescente o import no topo:

```ts
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
```

- [ ] **Step 5: Update the password-recovery endpoint**

Em `server/api/portal/recuperar-senha.post.ts`, troque

```ts
      remetente: { nome: tenant.name, replyTo: tenant.email },
```

por

```ts
      remetente: {
        nome: tenant.name,
        endereco: await remetenteDoTenant(tenant),
        replyTo: tenant.email,
      },
```

E acrescente o import no topo:

```ts
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/server/remetente-por-tenant.test.ts`
Expected: PASS (13 testes)

- [ ] **Step 7: Full validation**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck sem erro novo (os dois de `tenant.mapper.ts` na `main` não
existem na `develop`), todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add server/repositories/portal-invite.repository.ts server/api/admin/portal-users.post.ts server/api/portal/recuperar-senha.post.ts test/server/remetente-por-tenant.test.ts
git commit -m "feat(email): convite e recuperação de senha saem do domínio da imobiliária"
```

---

## Depois do código (não é tarefa de implementação)

1. **Aplicar a 0038 em produção.** Só cria tabela; é compatível com a versão no
   ar (sem linha = plataforma), então pode ir **antes** do deploy — a regra que o
   cabeçalho da 0018 registra depois do incidente de 18/08.
2. **Inserir a linha da OLMI**, por service role / SQL Editor:
   ```sql
   insert into public.tenant_mail_sender (tenant_id, from_address, notes)
   select id, 'nao-responda@olmiimoveis.com.br', 'plano com domínio dedicado'
   from public.tenants where slug = '<slug da olmi>';
   ```
3. **Conferir que a OLMI tem e-mail em Configurações** — senão o convite sai sem
   `Reply-To` e `remetente.dedicado_sem_reply_to` aparece no log.
4. **DMARC**, pendente nos dois domínios. Ver o
   [runbook 0034](../../runbooks/0034-email-transacional.md).
