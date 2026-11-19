import { describe, expect, test } from 'vitest'
import {
  caminhoDoDocumento,
  caminhoPertenceAoTenant,
  inspecionarBytes,
  lerAlvo,
  limparNome,
  validarEnvio,
} from '~~/server/utils/gestao-documento-regras'

const T = '11111111-1111-4111-8111-111111111111'
const D = '22222222-2222-4222-8222-222222222222'

describe('caminho do Storage', () => {
  test('é tenant/tipo/agregado/documento/versão', () => {
    expect(caminhoDoDocumento({ tenantId: T, alvoTipo: 'venda', alvoId: 'V-2026-0001', documentoId: D, versao: 2 })).toBe(
      `${T}/venda/V-2026-0001/${D}/2`,
    )
  })

  test.each([
    ['alvo com ..', { alvoId: '..' }],
    ['alvo com barra', { alvoId: 'V/../../outro' }],
    ['alvo vazio', { alvoId: '' }],
    ['tenant que não é uuid', { tenantId: '../outro' }],
    ['documento que não é uuid', { documentoId: 'x/y' }],
    ['tipo desconhecido', { alvoTipo: 'imovel' as never }],
    ['versão zero', { versao: 0 }],
    ['versão fracionada', { versao: 1.5 }],
  ])('recusa %s', (_n, troca) => {
    expect(() =>
      caminhoDoDocumento({ tenantId: T, alvoTipo: 'venda', alvoId: 'V-2026-0001', documentoId: D, versao: 1, ...troca }),
    ).toThrow()
  })

  test('só é do tenant quem começa pela pasta dele, sem escapar', () => {
    expect(caminhoPertenceAoTenant(`${T}/venda/V-1/${D}/1`, T)).toBe(true)
    expect(caminhoPertenceAoTenant(`outro/venda/V-1/${D}/1`, T)).toBe(false)
    expect(caminhoPertenceAoTenant(`${T}/../outro/x`, T)).toBe(false)
    expect(caminhoPertenceAoTenant(`${T}//x`, T)).toBe(false)
    expect(caminhoPertenceAoTenant(`${T}x/y`, T)).toBe(false)
    expect(caminhoPertenceAoTenant(null, T)).toBe(false)
  })
})

describe('alvo', () => {
  test('lê tipo:id e recusa o resto', () => {
    expect(lerAlvo('venda:V-2026-0001')).toEqual({ tipo: 'venda', id: 'V-2026-0001' })
    expect(lerAlvo('locacao:L-2026-0002')).toEqual({ tipo: 'locacao', id: 'L-2026-0002' })
    for (const ruim of ['imovel:x', 'venda', 'venda:', 'venda:../x', 'venda:a b', undefined, 3]) {
      expect(lerAlvo(ruim)).toBeNull()
    }
  })
})

describe('validarEnvio', () => {
  const ok = { nome: 'RG.pdf', tamanho: 1000, mime: 'application/pdf' }
  test('aceita pdf e imagens', () => {
    expect(validarEnvio(ok)).toEqual({ ok: true, nome: 'RG.pdf', mime: 'application/pdf' })
    expect(validarEnvio({ nome: 'foto.JPG', tamanho: 5, mime: 'image/jpeg' }).ok).toBe(true)
  })
  test('recusa extensão fora da lista, mime que não bate, vazio e acima de 15 MB', () => {
    expect(validarEnvio({ ...ok, nome: 'virus.exe', mime: 'application/octet-stream' }).ok).toBe(false)
    expect(validarEnvio({ ...ok, mime: 'image/png' }).ok).toBe(false)
    expect(validarEnvio({ ...ok, tamanho: 0 }).ok).toBe(false)
    expect(validarEnvio({ ...ok, tamanho: 15 * 1024 * 1024 + 1 }).ok).toBe(false)
    expect(validarEnvio({ ...ok, tamanho: 15 * 1024 * 1024 }).ok).toBe(true)
    expect(validarEnvio({ ...ok, tamanho: Number.NaN }).ok).toBe(false)
    expect(validarEnvio({ ...ok, nome: '' }).ok).toBe(false)
  })
  test('o nome perde pasta e caractere de controle', () => {
    expect(limparNome('../../etc/passwd.pdf')).toBe('passwd.pdf')
    expect(limparNome('C:\\x\\RG\u0000.pdf')).toBe('RG.pdf')
  })
})

describe('inspecionarBytes', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2])
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0])
  test('decide pelo conteúdo, não pelo nome', () => {
    expect(inspecionarBytes(pdf, 100)).toEqual({ ok: true, mime: 'application/pdf' })
    expect(inspecionarBytes(exe, 100).ok).toBe(false)
  })
  test('usa o tamanho real', () => {
    expect(inspecionarBytes(pdf, 16 * 1024 * 1024).ok).toBe(false)
    expect(inspecionarBytes(pdf, 0).ok).toBe(false)
  })
})
