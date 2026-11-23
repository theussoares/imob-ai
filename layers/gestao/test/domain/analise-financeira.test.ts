import { describe, expect, it } from 'vitest'
import { abrirProcesso, type Estado } from '../../domain/acoes'
import { aprovarAnaliseFinanceira, devolverAnaliseFinanceira, enviarAnaliseFinanceira } from '../../domain/acoes-analise'
import { salvarConferenciaFinal } from '../../domain/acoes-processo'
import { analiseEditavel, bloqueioFinalizacao } from '../../domain/analise-financeira'
import { capacidades, matrizComPadrao, matrizPadrao } from '../../domain/permissions'
import type { AnaliseFinanceira, Perfil, Processo, Sessao } from '../../domain/types'

const sessao = (perfil: Perfil, corretorId: string | null = null): Sessao => ({ perfil, nome: 'Teste', corretorId })
const matriz = matrizPadrao()
const ator = { nome: 'Carlos' }

function abrir(comAnaliseFin: boolean): { estado: Estado; id: string } {
  const r = abrirProcesso({ processos: [], documentos: [], locacoes: [] }, { imovel: 'Casa', vendedor: 'V', comprador: 'C', corretorId: 'c1', comAnaliseFin }, ator, '01/11/2026 10:00')
  if (!r.ok) throw new Error(r.erro)
  return { estado: r.estado, id: r.estado.processos[0]!.id }
}
const comValor = (e: Estado, id: string): Estado => ({ ...e, processos: e.processos.map((p) => (p.id === id ? { ...p, valor: 400000 } : p)) })
const ok = (r: ReturnType<typeof enviarAnaliseFinanceira>) => {
  if (!r.ok) throw new Error(r.erro)
  return r.estado
}
const analiseDe = (e: Estado, id: string) => e.processos.find((p) => p.id === id)!.analiseFin

describe('permissões do financeiro por perfil', () => {
  const p = (analiseFin?: AnaliseFinanceira): Pick<Processo, 'corretorId' | 'analiseFin'> => ({ corretorId: 'c1', analiseFin })

  it('corretor do processo vê e edita enquanto rascunho ou devolvido; em análise e aprovado, só vê', () => {
    const c = sessao('corretor', 'c1')
    for (const s of ['rascunho', 'devolvido'] as const) expect(capacidades(matriz, c, p({ status: s }))).toMatchObject({ verFinanceiro: true, editarFinanceiro: true, valores: false })
    for (const s of ['em-analise', 'aprovado'] as const) expect(capacidades(matriz, c, p({ status: s }))).toMatchObject({ verFinanceiro: true, editarFinanceiro: false })
    // Sem análise (legado, ou aberto por quem tem `valores`) ele lê, mas não edita: ninguém revisaria o que gravasse.
    expect(capacidades(matriz, c, p())).toMatchObject({ verFinanceiro: true, editarFinanceiro: false })
  })

  it('corretor de outro processo e recepção não veem nem editam', () => {
    expect(capacidades(matriz, sessao('corretor', 'c2'), p({ status: 'rascunho' }))).toMatchObject({ verFinanceiro: false, editarFinanceiro: false })
    expect(capacidades(matriz, sessao('recepcao'), p({ status: 'rascunho' }))).toMatchObject({ verFinanceiro: false, editarFinanceiro: false })
  })

  it('jurídico e dono (valores) editam em qualquer estado da análise', () => {
    for (const perfil of ['juridico', 'dono'] as const) {
      for (const s of ['rascunho', 'em-analise', 'aprovado', 'devolvido'] as const) expect(capacidades(matriz, sessao(perfil), p({ status: s }))).toMatchObject({ verFinanceiro: true, editarFinanceiro: true, valores: true })
    }
  })

  it('o Dono pode tirar o financeiro livre do corretor', () => {
    const m = { ...matrizPadrao(), financeiroLivre: { corretor: 'nao', recepcao: 'nao', juridico: 'sim', dono: 'sim' } } as const
    expect(capacidades(m, sessao('corretor', 'c1'), p({ status: 'rascunho' }))).toMatchObject({ verFinanceiro: false, editarFinanceiro: false })
  })

  it('matriz guardada sem a chave nova recebe o padrão, e a chave ausente nunca libera nada sozinha', () => {
    const antiga = matrizPadrao() as Partial<ReturnType<typeof matrizPadrao>>
    delete antiga.financeiroLivre
    expect(matrizComPadrao(antiga).financeiroLivre.corretor).toBe('proprio')
    expect(capacidades(antiga as ReturnType<typeof matrizPadrao>, sessao('corretor', 'c1'), p()).verFinanceiro).toBe(false)
  })

  it('analiseEditavel: só rascunho e devolvido; ausente (legado) não', () => {
    expect(analiseEditavel(undefined)).toBe(false)
    expect(analiseEditavel({ status: 'rascunho' })).toBe(true)
    expect(analiseEditavel({ status: 'devolvido' })).toBe(true)
    expect(analiseEditavel({ status: 'em-analise' })).toBe(false)
  })
})

describe('transições', () => {
  it('quem não tem valores abre em rascunho; quem tem, sem análise', () => {
    expect(analiseDe(abrir(true).estado, 'V-' + new Date().getFullYear() + '-0001')).toEqual({ status: 'rascunho' })
    expect(abrir(false).estado.processos[0]!.analiseFin).toBeUndefined()
  })

  it('rascunho → em análise → devolvido → em análise → aprovado, com quem e quando', () => {
    const { estado, id } = abrir(true)
    let e = ok(enviarAnaliseFinanceira(comValor(estado, id), id, ator, '02/11/2026 09:00'))
    expect(analiseDe(e, id)).toEqual({ status: 'em-analise', enviadoPor: 'Carlos', enviadoEm: '02/11/2026 09:00' })
    e = ok(devolverAnaliseFinanceira(e, id, '  Falta o adiantamento  ', { nome: 'Paulo' }, '03/11/2026 09:00'))
    expect(analiseDe(e, id)).toMatchObject({ status: 'devolvido', motivo: 'Falta o adiantamento', decididoPor: 'Paulo' })
    e = ok(enviarAnaliseFinanceira(e, id, ator, '04/11/2026 09:00'))
    expect(analiseDe(e, id)).toEqual({ status: 'em-analise', enviadoPor: 'Carlos', enviadoEm: '04/11/2026 09:00' })
    e = ok(aprovarAnaliseFinanceira(e, id, { nome: 'Paulo' }, '05/11/2026 09:00'))
    expect(analiseDe(e, id)).toMatchObject({ status: 'aprovado', decididoPor: 'Paulo', enviadoPor: 'Carlos' })
    expect(e.processos[0]!.hist.map((h) => h.acao).slice(0, 4)).toEqual(['Aprovou a análise do financeiro', 'Enviou o financeiro para análise', 'Devolveu a análise do financeiro', 'Enviou o financeiro para análise'])
  })

  it('recusa: enviar sem valor, enviar duas vezes, aprovar/devolver fora de análise, devolver sem motivo', () => {
    const { estado, id } = abrir(true)
    expect(enviarAnaliseFinanceira(estado, id, ator)).toMatchObject({ ok: false, erro: 'Informe o valor da venda antes de enviar para análise.' })
    const enviado = ok(enviarAnaliseFinanceira(comValor(estado, id), id, ator))
    expect(enviarAnaliseFinanceira(enviado, id, ator)).toMatchObject({ ok: false, erro: 'O financeiro já está em análise.' })
    expect(aprovarAnaliseFinanceira(estado, id, ator)).toMatchObject({ ok: false })
    expect(devolverAnaliseFinanceira(estado, id, 'x', ator)).toMatchObject({ ok: false })
    expect(devolverAnaliseFinanceira(enviado, id, '   ', ator)).toMatchObject({ ok: false, erro: 'Diga o que precisa ser corrigido.' })
    const aprovado = ok(aprovarAnaliseFinanceira(enviado, id, ator))
    expect(enviarAnaliseFinanceira(aprovado, id, ator)).toMatchObject({ ok: false, erro: 'O financeiro já foi aprovado.' })
  })
})

describe('finalização', () => {
  const conferencia = { documentacao: true, valores: true, comissao: true, encaminhado: true, responsavel: 'Marina', data: '2026-11-20' }

  it('só encaminha com análise aprovada; sem análise (legado) não bloqueia; sem encaminhar, salva', () => {
    expect(bloqueioFinalizacao(undefined)).toBeNull()
    expect(bloqueioFinalizacao({ status: 'aprovado' })).toBeNull()
    for (const s of ['rascunho', 'em-analise', 'devolvido'] as const) expect(bloqueioFinalizacao({ status: s })).toContain('não foi aprovado')
    const { estado, id } = abrir(true)
    expect(salvarConferenciaFinal(estado, id, conferencia, ator)).toMatchObject({ ok: false })
    expect(salvarConferenciaFinal(estado, id, { ...conferencia, encaminhado: false }, ator)).toMatchObject({ ok: true })
    const legado = abrir(false)
    expect(salvarConferenciaFinal(legado.estado, legado.id, conferencia, ator)).toMatchObject({ ok: true })
  })
})
