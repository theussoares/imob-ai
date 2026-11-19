import { describe, expect, it } from 'vitest'
import { abrirProcesso } from '../../domain/acoes'
import { cnpjValido, configuracoesPadrao, validarConfiguracoes } from '../../domain/configuracoes'

const com = (p: Partial<ReturnType<typeof configuracoesPadrao>['imobiliaria']> = {}, extra: Partial<ReturnType<typeof configuracoesPadrao>> = {}) => {
  const base = configuracoesPadrao()
  return { ...base, ...extra, imobiliaria: { ...base.imobiliaria, ...p } }
}

describe('cnpjValido', () => {
  it('confere os dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(cnpjValido('123')).toBe(false)
  })
})

describe('validarConfiguracoes', () => {
  it('o padrão é válido', () => {
    expect(validarConfiguracoes(configuracoesPadrao())).toMatchObject({ ok: true })
  })

  it('apara espaços e aceita CNPJ, e-mail e telefone vazios', () => {
    const r = validarConfiguracoes(com({ nome: '  Olmi  ' }))
    expect(r.ok && r.config.imobiliaria.nome).toBe('Olmi')
  })

  it.each([
    [com({ nome: '   ' }), 'Informe o nome da imobiliária.'],
    [com({ cnpj: '12.345.678/0001-00' }), 'O CNPJ não é válido.'],
    [com({ email: 'sem-arroba' }), 'O e-mail não é válido.'],
    [com({ telefone: '1234' }), 'O telefone precisa de DDD e 8 ou 9 dígitos.'],
    [com({}, { comissaoPct: 101 }), 'A comissão padrão deve ficar entre 0 e 100%.'],
    [com({}, { comissaoPct: Number.NaN }), 'A comissão padrão deve ficar entre 0 e 100%.'],
    [com({}, { taxaLocacaoPct: -1 }), 'A taxa da locação deve ficar entre 0 e 100%.'],
  ])('recusa %#', (cfg, erro) => {
    expect(validarConfiguracoes(cfg)).toEqual({ ok: false, erro })
  })

  it('aceita 0% e 100% nas pontas', () => {
    expect(validarConfiguracoes(com({}, { comissaoPct: 0, taxaLocacaoPct: 100 }))).toMatchObject({ ok: true })
  })
})

describe('comissão padrão na abertura da venda', () => {
  const vazio = { processos: [], documentos: [], locacoes: [] }
  const dados = { imovel: 'Casa', vendedor: 'A', comprador: 'B', corretorId: 'c1' }

  it('usa o percentual informado e cai em 5% sem ele', () => {
    const a = abrirProcesso(vazio, { ...dados, pct: 6.5 }, { nome: 'x' })
    const b = abrirProcesso(vazio, dados, { nome: 'x' })
    expect(a.ok && a.estado.processos[0]!.pct).toBe(6.5)
    expect(b.ok && b.estado.processos[0]!.pct).toBe(5)
  })
})

describe('erros por campo e nome padrão', () => {
  it('multa −5 e juros 150 acusam o PRÓPRIO campo, e todos de uma vez', async () => {
    const { errosConfiguracoes } = await import('../../domain/configuracoes')
    const e = errosConfiguracoes({ ...configuracoesPadrao(), multaAtrasoPct: -5, jurosMesPct: 150, comissaoPct: 101 })
    expect(Object.keys(e)).toEqual(['comissaoPct', 'multaAtrasoPct', 'jurosMesPct'])
  })

  it('o nome padrão é o do tenant, nunca uma string fixa de outro cliente', () => {
    expect(configuracoesPadrao('Aurora Imóveis').imobiliaria.nome).toBe('Aurora Imóveis')
    expect(JSON.stringify(configuracoesPadrao())).not.toMatch(/OLMI/)
  })
})
