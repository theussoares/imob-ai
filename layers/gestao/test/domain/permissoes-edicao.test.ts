import { describe, expect, it } from 'vitest'
import { alterarPermissao, capacidades, matrizPadrao, menuVisivel, permissaoFixa } from '../../domain/permissions'

describe('alterarPermissao', () => {
  it('muda só a célula pedida e não suja a matriz de origem', () => {
    const base = matrizPadrao()
    const r = alterarPermissao(base, 'arquivar', 'recepcao', 'sim')
    expect(r.ok && r.matriz.arquivar.recepcao).toBe('sim')
    expect(r.ok && r.matriz.arquivar.corretor).toBe('nao')
    expect(base.arquivar.recepcao).toBe('nao')
  })

  it('a mudança vale de verdade: a recepção passa a ver «Arquivados»', () => {
    const base = matrizPadrao()
    // Recepção já apaga documentos e vê «Arquivados»; tira e confere o efeito no menu.
    expect(menuVisivel(base, 'recepcao', 'arquivados')).toBe(true)
    const r = alterarPermissao(base, 'apagarDocs', 'recepcao', 'nao')
    expect(r.ok && menuVisivel(r.matriz, 'recepcao', 'arquivados')).toBe(false)
    const sessao = { perfil: 'recepcao' as const, nome: 'Marina', corretorId: null }
    const c = r.ok ? capacidades(r.matriz, sessao) : null
    expect(c?.apagarDocs).toBe(false)
  })

  it('recusa valor que a permissão não admite', () => {
    const r = alterarPermissao(matrizPadrao(), 'criar', 'corretor', 'proprio')
    expect(r).toMatchObject({ ok: false })
    expect(alterarPermissao(matrizPadrao(), 'verTodos', 'corretor', 'nao')).toMatchObject({ ok: false })
  })

  it('o Dono não perde admin nem convidar, mas pode perder o resto', () => {
    for (const chave of ['admin', 'convidar'] as const) {
      expect(permissaoFixa(chave, 'dono')).toBe(true)
      expect(alterarPermissao(matrizPadrao(), chave, 'dono', 'nao')).toMatchObject({ ok: false })
    }
    expect(permissaoFixa('admin', 'juridico')).toBe(false)
    expect(alterarPermissao(matrizPadrao(), 'consulta', 'dono', 'nao')).toMatchObject({ ok: true })
  })

  it('dá a um perfil a permissão de administrar', () => {
    const r = alterarPermissao(matrizPadrao(), 'admin', 'juridico', 'sim')
    expect(r.ok && menuVisivel(r.matriz, 'juridico', 'config')).toBe(true)
  })

  it('recusa permissão inexistente', () => {
    expect(alterarPermissao(matrizPadrao(), 'x' as never, 'dono', 'sim')).toMatchObject({ ok: false, erro: 'Permissão desconhecida.' })
  })
})
