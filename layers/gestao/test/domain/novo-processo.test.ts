import { describe, expect, it } from 'vitest'
import { abrirProcesso } from '../../domain/acoes'
import { completarProcesso, emailValido, telefoneValido, validarContato, validarPdf } from '../../domain/novo-processo'
import { processosSeed } from '../../domain/seed'

const vazio = { telefone: '', email: '' }

describe('complemento do novo processo', () => {
  it('telefone: 10/11 dígitos com ou sem máscara e +55', () => {
    expect(telefoneValido('(11) 98765-4321')).toBe(true)
    expect(telefoneValido('1132104321')).toBe(true)
    expect(telefoneValido('+55 11 98765-4321')).toBe(true)
    expect(telefoneValido('9876-4321')).toBe(false)
  })

  it('e-mail exige arroba e domínio', () => {
    expect(emailValido('a@b.com')).toBe(true)
    expect(emailValido('a@b')).toBe(false)
    expect(emailValido('a b@c.com')).toBe(false)
  })

  it('contato é opcional: vazio passa, preenchido errado não', () => {
    expect(validarContato('vendedor', vazio)).toBeNull()
    expect(validarContato('vendedor', { telefone: '123', email: '' })).toMatch(/Telefone do vendedor/)
    expect(validarContato('comprador', { telefone: '', email: 'x' })).toMatch(/E-mail do comprador/)
  })

  it('PDF: só .pdf e até 15 MB; sem arquivo passa', () => {
    expect(validarPdf(null)).toBeNull()
    expect(validarPdf({ name: 'c.PDF', size: 1000 })).toBeNull()
    expect(validarPdf({ name: 'c.png', size: 1000 })).toMatch(/PDF/)
    expect(validarPdf({ name: 'c.pdf', size: 16 * 1024 * 1024 })).toMatch(/15 MB/)
  })

  it('completa o processo recém-criado sem tocar nos outros', () => {
    const estado = { processos: processosSeed(), documentos: [], locacoes: [] }
    const r = abrirProcesso(estado, { imovel: 'Apto', vendedor: 'A', comprador: 'B', corretorId: 'c1' }, { nome: 'T' })
    if (!r.ok) throw new Error('setup')
    const novo = r.estado.processos[0]!
    const c = completarProcesso(r.estado, novo.id, {
      vendedor: { telefone: ' 11987654321 ', email: '' },
      comprador: { telefone: '', email: 'b@x.com' },
      pdf: true,
    })
    if (!c.ok) throw new Error('complemento')
    const p = c.estado.processos[0]!
    expect(p.vendedor).toEqual({ nome: 'A', cpf: '', telefone: '11987654321' })
    expect(p.comprador).toEqual({ nome: 'B', cpf: '', email: 'b@x.com' })
    expect(p.pdf).toBe(true)
    expect(c.estado.processos.slice(1)).toEqual(r.estado.processos.slice(1))
  })

  it('id inexistente é erro', () => {
    expect(completarProcesso({ processos: [], documentos: [], locacoes: [] }, 'x', { vendedor: vazio, comprador: vazio, pdf: false }).ok).toBe(false)
  })
})

describe('erros por campo dos modais', () => {
  it('«Novo processo» vazio acusa imóvel, vendedor, comprador e corretor, nesta ordem', async () => {
    const { errosNovoProcesso } = await import('../../domain/novo-processo')
    const vazio = { imovelId: '', vendedor: '', telVendedor: '', emailVendedor: '', comprador: '', telComprador: '', emailComprador: '', corretorId: '' }
    expect(Object.keys(errosNovoProcesso(vazio, null))).toEqual(['imovelId', 'vendedor', 'comprador', 'corretorId'])
    expect(Object.keys(errosNovoProcesso({ ...vazio, imovelId: 'x', vendedor: 'a', comprador: 'b', corretorId: 'c', telVendedor: 'abc', emailComprador: 'x' }, null))).toEqual(['telVendedor', 'emailComprador'])
  })

  it('«Nova locação» exige imóvel escolhido (sem pré-seleção), locador, locatário e corretor', async () => {
    const { errosNovaLocacao } = await import('../../domain/novo-processo')
    expect(Object.keys(errosNovaLocacao({ imovelId: '', locador: '', locatario: '', corretorId: '' }))).toEqual(['imovelId', 'locador', 'locatario', 'corretorId'])
    expect(errosNovaLocacao({ imovelId: 'i', locador: 'a', locatario: 'b', corretorId: 'c' })).toEqual({})
  })
})
