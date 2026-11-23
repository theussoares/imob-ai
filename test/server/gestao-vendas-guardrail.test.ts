import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { processosSeed } from '~~/layers/gestao/domain/seed'
import { processoSchema, recortarValores, toVendaColunas, toVendaModel } from '~~/server/mappers/gestao-venda'
import { ACOES_VENDA } from '~~/server/utils/gestao-vendas-acoes'

/**
 * Travas da F2 que leem o fonte e o schema. Valem pelo que impedem:
 *  - tabela nova sem RLS/revoke (o GRANT default do Supabase abre para anon);
 *  - endpoint que aceita tenant do corpo ou devolve row cru;
 *  - Zod do mapper divergindo do tipo `Processo` do domínio (o seed é o oráculo).
 */
const fonte = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

describe('migration 0060', () => {
  const sql = fonte('supabase', 'migrations', '0060_gestao_vendas.sql')

  test('RLS ligada, revoke de anon/authenticated e nenhuma policy', () => {
    expect(sql).toContain('alter table public.gestao_vendas enable row level security')
    expect(sql).toMatch(/revoke all on public\.gestao_vendas from anon, authenticated/)
    expect(sql).not.toMatch(/create policy/i)
  })

  test('pk e FK composta amarram tudo ao tenant; é idempotente', () => {
    expect(sql).toContain('primary key (tenant_id, id)')
    expect(sql).toContain('foreign key (corretor_id, tenant_id) references public.brokers (id, tenant_id)')
    expect(sql).toMatch(/create table if not exists public\.gestao_vendas/)
    expect(sql).not.toMatch(/^\s*create (unique )?index (?!if not exists)/im)
  })
})

describe('endpoints', () => {
  const dir = join(process.cwd(), 'server', 'api', 'gestao')
  const arquivos = [
    ['vendas.get.ts'],
    ['vendas.post.ts'],
    ['vendas', '[id].get.ts'],
    ['vendas', '[id]', 'acoes.post.ts'],
  ]

  test.each(arquivos)('%s autentica pelo membro e nunca lê tenant do corpo', (...partes) => {
    const src = fonte('server', 'api', 'gestao', ...partes)
    expect(src).toContain('requireGestaoMember(event)')
    expect(src).not.toMatch(/tenantId\s*[:=]\s*(body|corpo)/)
    expect(src).not.toMatch(/\.from\(|serviceSupabase|\.select\(/)
  })

  test('só existem os endpoints esperados de vendas', () => {
    expect(readdirSync(dir).filter((f) => f.startsWith('vendas')).sort()).toEqual(['vendas', 'vendas.get.ts', 'vendas.post.ts'])
  })
})

describe('mapper', () => {
  test('todo processo do seed passa no Zod (o schema acompanha o tipo do domínio)', () => {
    for (const p of processosSeed()) expect(() => processoSchema.parse(p), p.id).not.toThrow()
  })

  test('ida e volta: a row reconstrói o mesmo processo, e o id da coluna manda sobre o do jsonb', () => {
    const p = processosSeed()[0]!
    const cols = toVendaColunas(p)
    const v = toVendaModel({ id: 'V-2026-9999', tenant_id: 't', versao: 4, updated_at: '', ...cols })
    expect(v.processo).toEqual({ ...p, id: 'V-2026-9999' })
    expect(v.versao).toBe(4)
  })

  // Processo gravado quando o checklist ainda tinha o campo Entrada: sem a dobra o Zod
  // descartaria o valor, as fontes deixariam de fechar e a etapa 5 voltaria a pedir ajuste.
  test('lê processo antigo com `entrada` somando o valor ao recurso próprio', () => {
    const p = processosSeed()[0]!
    const antigo = { ...p, fin: { ...p.fin, entrada: 30000, proprios: 10000 } }
    const v = toVendaModel({ id: p.id, tenant_id: 't', versao: 1, updated_at: '', ...toVendaColunas(antigo as typeof p) })
    expect(v.processo.fin.proprios).toBe(40000)
    expect('entrada' in v.processo.fin).toBe(false)
  })

  test('o recorte sem valores remove exatamente pct, adiantamentos e fin', () => {
    const p = processosSeed()[0]!
    const r = recortarValores(p, false)
    expect(Object.keys(p).filter((k) => !(k in r)).sort()).toEqual(['adiantamentos', 'fin', 'pct'])
  })
})

describe('mapa de ações', () => {
  test('cobre exatamente as ações do plano', () => {
    expect(Object.keys(ACOES_VENDA).sort()).toEqual(
      ['mudarStatus', 'concluirEtapa', 'salvarAbertura', 'salvarObservacao', 'arquivarProcesso', 'restaurarProcesso', 'registrarAdiantamento', 'marcarAdiantamentoPago', 'removerAdiantamento', 'salvarFinanceiro', 'salvarPessoa', 'salvarImovel', 'marcarMatriculaMae', 'salvarConferenciaFinal', 'enviarAnaliseFinanceira', 'aprovarAnaliseFinanceira', 'devolverAnaliseFinanceira'].sort(),
    )
  })

  test('os schemas descartam campos desconhecidos (tenant/ator/quando do corpo não passam)', () => {
    const r = ACOES_VENDA.salvarImovel.schema.parse({ matriculaMae: true, valorVenal: 1, tenantId: 'x', ator: 'y' })
    expect(r).toEqual({ matriculaMae: true, valorVenal: 1 })
  })
})
