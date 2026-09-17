import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { remetenteDoTenant } from '~~/server/utils/mail-sender'
import type { Tenant } from '~~/shared/models/tenant'

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
  /**
   * Só as instruções, sem os comentários.
   *
   * O cabeçalho da migration cita `for all` de propósito — é ele que explica
   * por que uma policy dessas entregaria o remetente à própria imobiliária.
   * Afirmar sobre o arquivo cru faria o teste exigir que a armadilha não
   * fosse documentada.
   */
  const sql = () =>
    readFileSync(MIGRATION, 'utf8')
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('--'))
      .join('\n')

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

describe('os dois caminhos de envio usam a fonte única', () => {
  const fonte = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

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
