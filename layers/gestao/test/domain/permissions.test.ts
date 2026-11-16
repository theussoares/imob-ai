import { describe, expect, it } from 'vitest'
import { capacidades, locacoesVisiveis, matrizPadrao, menuVisivel, MENU, processosVisiveis, sessaoDoPerfil } from '../../domain/permissions'
import { locacoesSeed } from '../../domain/locacao-seed'
import { processosSeed } from '../../domain/seed'

describe('permissões do painel de gestão', () => {
  const matriz = matrizPadrao()
  const processos = processosSeed()

  it('corretor só enxerga os próprios processos', () => {
    const v = processosVisiveis(matriz, sessaoDoPerfil('corretor'), processos)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((p) => p.corretorId === 'c1')).toBe(true)
  })

  it.each(['recepcao', 'juridico', 'dono'] as const)('%s enxerga os processos de todos', (perfil) => {
    const v = processosVisiveis(matriz, sessaoDoPerfil(perfil), processos)
    expect(v).toHaveLength(processos.length)
  })

  it('processo arquivado não aparece na lista, nem para o dono', () => {
    const arquivado = { ...processos[0]!, arquivado: true }
    const v = processosVisiveis(matriz, sessaoDoPerfil('dono'), [arquivado, ...processos.slice(1)])
    expect(v.find((p) => p.id === arquivado.id)).toBeUndefined()
  })

  it('corretor edita só o processo em que é o corretor (editar = proprio)', () => {
    const s = sessaoDoPerfil('corretor')
    const meu = processos.find((p) => p.corretorId === 'c1')!
    const alheio = processos.find((p) => p.corretorId !== 'c1')!
    expect(capacidades(matriz, s, meu).editar).toBe(true)
    expect(capacidades(matriz, s, alheio).editar).toBe(false)
    // sem processo, "proprio" conta como sim: a pergunta é se pode editar algo
    expect(capacidades(matriz, s, null).editar).toBe(true)
  })

  it('só jurídico e dono veem valores e comissões; só o dono administra', () => {
    expect(capacidades(matriz, sessaoDoPerfil('corretor')).valores).toBe(false)
    expect(capacidades(matriz, sessaoDoPerfil('recepcao')).valores).toBe(false)
    expect(capacidades(matriz, sessaoDoPerfil('juridico')).valores).toBe(true)
    expect(capacidades(matriz, sessaoDoPerfil('juridico')).admin).toBe(false)
    expect(capacidades(matriz, sessaoDoPerfil('dono')).admin).toBe(true)
  })

  it('menu: financeiro, auditoria, usuários e configurações respeitam o perfil', () => {
    const vis = (perfil: Parameters<typeof menuVisivel>[1]) =>
      MENU.filter((m) => menuVisivel(matriz, perfil, m.chave)).map((m) => m.chave)
    expect(vis('corretor')).not.toContain('financeiro')
    expect(vis('corretor')).not.toContain('usuarios')
    expect(vis('recepcao')).toContain('consulta')
    expect(vis('recepcao')).toContain('arquivados')
    expect(vis('juridico')).toContain('financeiro')
    expect(vis('juridico')).not.toContain('config')
    expect(vis('juridico')).toContain('usuarios') // convida, mas não administra
    expect(vis('recepcao')).not.toContain('usuarios')
    expect(vis('dono')).toHaveLength(MENU.length)
  })

  it('só dono e jurídico podem convidar usuários', () => {
    expect(capacidades(matriz, sessaoDoPerfil('corretor')).convidar).toBe(false)
    expect(capacidades(matriz, sessaoDoPerfil('recepcao')).convidar).toBe(false)
    expect(capacidades(matriz, sessaoDoPerfil('juridico')).convidar).toBe(true)
    expect(capacidades(matriz, sessaoDoPerfil('dono')).convidar).toBe(true)
  })

  it('matrizPadrao devolve cópia: editar uma não suja a próxima', () => {
    const a = matrizPadrao()
    a.valores.corretor = 'sim'
    expect(matrizPadrao().valores.corretor).toBe('nao')
  })

  it('chave ausente na matriz vira "nao" (lado seguro), não erro', () => {
    const quebrada = { ...matrizPadrao(), admin: undefined } as unknown as ReturnType<typeof matrizPadrao>
    expect(capacidades(quebrada, sessaoDoPerfil('dono')).admin).toBe(false)
  })
})

describe('locacoesVisiveis', () => {
  const sessao = (perfil: 'corretor' | 'recepcao', corretorId: string | null) => ({ perfil, nome: 'x', corretorId })
  it('corretor vê só as suas, recepção vê todas, arquivada some', () => {
    const todas = locacoesSeed()
    const arquivada = { ...todas[0]!, id: 'L-X', arquivado: true }
    const m = matrizPadrao()
    const c1 = locacoesVisiveis(m, sessao('corretor', 'c1'), [...todas, arquivada])
    expect(c1.length).toBeGreaterThan(0)
    expect(c1.every((l) => l.corretorId === 'c1' && !l.arquivado)).toBe(true)
    expect(locacoesVisiveis(m, sessao('recepcao', null), [...todas, arquivada])).toHaveLength(todas.length)
  })
})
