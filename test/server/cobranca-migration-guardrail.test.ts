import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * A 0051 guarda a chave que move o dinheiro de cada imobiliária. As
 * invariantes aqui são lidas do SQL SEM comentários — comentar o `revoke` é a
 * mutação mais barata que existe e, lida com comentário, passaria verde (a
 * lição do `financeiro-guardrail`).
 */
const SQL = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0051_cobranca_provedor.sql'), 'utf8').replace(/--[^\n]*/g, '')

describe('0051 — conta de cobrança fechada', () => {
  test('tenant_payment_accounts: RLS, sem grant para anon NEM para authenticated, e sem policy', () => {
    // O membro também não lê: um texto cifrado exposto no navegador é alvo de
    // força bruta offline no dia em que a chave-mestra vazar. O painel vê só o
    // recorte do endpoint (provedor, ambiente, 4 últimos dígitos).
    expect(SQL).toMatch(/alter table public\.tenant_payment_accounts enable row level security/)
    expect(SQL).toMatch(/revoke all on public\.tenant_payment_accounts from anon/)
    expect(SQL).toMatch(/revoke all on public\.tenant_payment_accounts from authenticated/)
    expect(SQL).not.toMatch(/create policy[^;]*on public\.tenant_payment_accounts/)
    expect(SQL).not.toMatch(/grant[^;]*tenant_payment_accounts/)
  })

  test('a chave não tem coluna em texto puro — só a cifrada e os 4 últimos', () => {
    const bloco = SQL.split('create table if not exists public.tenant_payment_accounts')[1]!.split(');')[0]!
    const colunas = [...bloco.matchAll(/^\s+([a-z0-9_]+)\s/gm)].map((m) => m[1])
    expect(colunas.filter((c) => c!.includes('api_key'))).toEqual(['api_key_ciphertext', 'api_key_last4'])
    // O segredo do webhook: só o hash.
    expect(colunas.filter((c) => c!.includes('secret'))).toEqual(['webhook_secret_hash'])
  })

  for (const t of ['payment_customers', 'payment_webhook_events']) {
    test(`${t}: fechada ao anon, escrita só pela service_role, leitura por membro`, () => {
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t} from anon`))
      expect(SQL).toMatch(new RegExp(`revoke insert, update, delete, truncate on public\\.${t} from authenticated`))
      const pols = SQL.match(new RegExp(`create policy[^;]*on public\\.${t}[^;]*;`, 'g')) ?? []
      expect(pols.length).toBeGreaterThan(0)
      for (const p of pols) {
        expect(p).toMatch(/for select to authenticated/)
        expect(p).toMatch(/is_tenant_member\(tenant_id\)/)
      }
    })
  }

  test('o id externo é único por tenant+provedor (um pagamento não baixa duas cobranças)', () => {
    expect(SQL).toMatch(/create unique index if not exists contract_charges_externo_idx\s+on public\.contract_charges \(tenant_id, provider, external_id\)/)
  })

  test('o diário do webhook trava o reenvio por tenant', () => {
    expect(SQL).toMatch(/unique \(tenant_id, provider, event_id\)/)
  })
})
