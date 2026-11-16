import { describe, expect, it } from 'vitest'
import { filtrarProcessos, normalizar } from '../../domain/filtro'
import { CORRETORES, processosSeed } from '../../domain/seed'

describe('filtro da lista de contratos', () => {
  const todos = processosSeed()
  const filtrar = (q: string, status: Parameters<typeof filtrarProcessos>[1]['status'] = '') =>
    filtrarProcessos(todos, { q, status }, CORRETORES)

  it('sem busca e sem status devolve tudo', () => {
    expect(filtrar('')).toHaveLength(todos.length)
    expect(filtrar('   ')).toHaveLength(todos.length)
  })

  it('ignora acento e caixa nos dois sentidos', () => {
    const p = todos[0]!
    const comAcento = p.vendedor.nome.toUpperCase()
    const semAcento = normalizar(p.vendedor.nome)
    expect(filtrar(comAcento).map((x) => x.id)).toContain(p.id)
    expect(filtrar(semAcento).map((x) => x.id)).toContain(p.id)
    expect(filtrar('aguardando documentacao').every((x) => x.status === 'Aguardando documentação')).toBe(true)
    expect(filtrar('aguardando documentacao').length).toBeGreaterThan(0)
  })

  it('acha pelo nome do corretor e pelo id', () => {
    const doCarlos = filtrar('carlos mendes')
    expect(doCarlos.length).toBeGreaterThan(0)
    expect(doCarlos.every((x) => x.corretorId === 'c1' || /carlos/i.test(x.vendedor.nome + x.comprador.nome))).toBe(true)
    expect(filtrar(todos[0]!.id.toLowerCase()).map((x) => x.id)).toContain(todos[0]!.id)
  })

  it('CPF casa pelos dígitos, com ou sem pontuação, inclusive parcial', () => {
    const p = todos.find((x) => x.vendedor.cpf)!
    const digitos = p.vendedor.cpf.replace(/\D/g, '')
    expect(filtrar(p.vendedor.cpf).map((x) => x.id)).toContain(p.id)
    expect(filtrar(digitos).map((x) => x.id)).toContain(p.id)
    expect(filtrar(digitos.slice(0, 6)).map((x) => x.id)).toContain(p.id)
  })

  it('termo sem dígito não casa CPF vazio de processo novo', () => {
    const novo = { ...todos[0]!, id: 'V-9999-0001', vendedor: { nome: 'Zé', cpf: '' }, comprador: { nome: 'Ana', cpf: '' } }
    const r = filtrarProcessos([novo], { q: 'xyz', status: '' }, CORRETORES)
    expect(r).toHaveLength(0)
  })

  it('status restringe, e combina com a busca', () => {
    const alvo = todos[0]!
    const soStatus = filtrar('', alvo.status)
    expect(soStatus.length).toBeGreaterThan(0)
    expect(soStatus.every((x) => x.status === alvo.status)).toBe(true)
    const combinado = filtrar(alvo.id, alvo.status)
    expect(combinado.map((x) => x.id)).toEqual([alvo.id])
    const outro = filtrar(alvo.id, 'Venda cancelada')
    expect(outro.some((x) => x.id === alvo.id)).toBe(alvo.status === 'Venda cancelada')
  })

  it('vários termos estreitam (AND)', () => {
    const p = todos[0]!
    expect(filtrar(`${p.id} zzzinexistente`)).toHaveLength(0)
  })

  it('sem resultado devolve lista vazia', () => {
    expect(filtrar('nada disso existe')).toEqual([])
  })
})
