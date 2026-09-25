import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { assertTenantSettingsInput } from '~~/server/utils/validate'
import { toTenantModel, toTenantUpdateRow, type TenantPublicRow } from '~~/server/mappers/tenant.mapper'
import {
  HEADER_STYLES,
  SITE_THEMES,
  SUGGESTED_HEADER,
  cabecalhoValido,
  temaValido,
} from '~~/shared/models/site-theme'

/**
 * Tema da vitrine e estilo do cabeçalho (spec 2026-09-25-temas-da-vitrine).
 *
 * ⚠️ O valor vira atributo no <html> e escolhe o CSS do site de um cliente.
 * O risco que estes testes guardam: um texto arbitrário do banco chegando ao
 * atributo; um valor inválido que o painel aceita e o site ignora sem avisar;
 * salvar OUTRA seção do painel reescrevendo o tema de todo mundo; e a lista do
 * código divergindo da constraint do banco, o que faz o painel oferecer um tema
 * que o Postgres recusa.
 */

describe('normalização na leitura', () => {
  test('valor fora da lista cai no clássico e no cabeçalho claro', () => {
    for (const lixo of ['', null, undefined, 'Moderno', 'escuro', '"><script>', 42]) {
      expect(temaValido(lixo)).toBe('classico')
    }
    expect(cabecalhoValido('moderno')).toBe('claro')
    expect(cabecalhoValido(undefined)).toBe('claro')
  })

  test('valores válidos passam como estão', () => {
    for (const t of SITE_THEMES) expect(temaValido(t)).toBe(t)
    for (const h of HEADER_STYLES) expect(cabecalhoValido(h)).toBe(h)
  })

  test('o mapper normaliza o que vem do banco antes de chegar ao modelo', () => {
    const row = { site_theme: 'inventado', header_style: 'neon' } as unknown as TenantPublicRow
    const t = toTenantModel(row)
    expect(t.siteTheme).toBe('classico')
    expect(t.headerStyle).toBe('claro')
  })

  test('todo tema tem um cabeçalho sugerido que existe', () => {
    for (const t of SITE_THEMES) expect(HEADER_STYLES).toContain(SUGGESTED_HEADER[t])
  })
})

describe('gravação', () => {
  test('tema ou cabeçalho fora da lista é 422 com mensagem legível', () => {
    expect(() => assertTenantSettingsInput({ siteTheme: 'neon' as never })).toThrow(
      expect.objectContaining({ statusCode: 422, statusMessage: 'Tema do site inválido.' }),
    )
    expect(() => assertTenantSettingsInput({ headerStyle: 'azul' as never })).toThrow(
      expect.objectContaining({ statusCode: 422, statusMessage: 'Estilo do cabeçalho inválido.' }),
    )
  })

  test('valores válidos passam', () => {
    for (const t of SITE_THEMES) expect(() => assertTenantSettingsInput({ siteTheme: t })).not.toThrow()
    for (const h of HEADER_STYLES) expect(() => assertTenantSettingsInput({ headerStyle: h })).not.toThrow()
  })

  // Mesmo incidente que o teste do aiTone protege: a tela de outra seção não
  // declara o tema, e `undefined` não pode virar chave no update parcial.
  test('salvar sem declarar tema não produz as chaves no update', () => {
    const row = toTenantUpdateRow({ name: 'Imóveis Exemplo' })
    expect('site_theme' in row).toBe(false)
    expect('header_style' in row).toBe(false)
  })

  test('mapeia para as colunas quando informados', () => {
    const row = toTenantUpdateRow({ siteTheme: 'alto_padrao', headerStyle: 'escuro' })
    expect(row.site_theme).toBe('alto_padrao')
    expect(row.header_style).toBe('escuro')
  })
})

describe('lista do código = constraint do banco', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0049_temas_da_vitrine.sql'), 'utf8')
    .replace(/--.*$/gm, '')

  function valoresDoCheck(coluna: string): string[] {
    const m = sql.match(new RegExp(`check \\(${coluna} in \\(([^)]*)\\)\\)`))
    if (!m) throw new Error(`check de ${coluna} não encontrado na 0049`)
    return m[1]!.split(',').map((v) => v.trim().replace(/'/g, ''))
  }

  test('temas', () => {
    expect(valoresDoCheck('site_theme').sort()).toEqual([...SITE_THEMES].sort())
  })

  test('cabeçalhos', () => {
    expect(valoresDoCheck('header_style').sort()).toEqual([...HEADER_STYLES].sort())
  })

  test('o default da coluna é o site de antes dos temas', () => {
    expect(sql).toMatch(/site_theme text not null default 'classico'/)
    expect(sql).toMatch(/header_style text not null default 'claro'/)
  })
})
