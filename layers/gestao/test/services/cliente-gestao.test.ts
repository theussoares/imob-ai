import { describe, expect, it } from 'vitest'
import { criarClienteGestao, MSG_CONFLITO, paraFalha, traduzirErro, type Fetcher } from '../../app/services/clienteGestao'

const erroFetch = (status: number, corpo: unknown) => Object.assign(new Error('fetch'), { status, data: corpo })

describe('traduzirErro / paraFalha', () => {
  it('422: mostra a frase do domínio (data.erro tem prioridade sobre o statusMessage)', () => {
    const f = paraFalha(erroFetch(422, { statusMessage: 'Unprocessable', data: { erro: 'Informe o vendedor.' } }))
    expect(f).toEqual({ ok: false, erro: 'Informe o vendedor.' })
  })

  it('409 de versão: conflito, com a frase do servidor', () => {
    const f = paraFalha(erroFetch(409, { statusMessage: 'Este processo foi alterado por outra pessoa. Recarregue.' }))
    expect(f).toMatchObject({ ok: false, conflito: true, erro: 'Este processo foi alterado por outra pessoa. Recarregue.' })
  })

  it('409 sem a frase de versão: usa a do cliente, também como conflito', () => {
    expect(paraFalha(erroFetch(409, {}))).toMatchObject({ conflito: true, erro: MSG_CONFLITO })
  })

  it('401 marca sessão expirada; 429 leva os segundos; código de bloqueio passa adiante', () => {
    expect(paraFalha(erroFetch(401, {}))).toMatchObject({ sessaoExpirada: true })
    expect(paraFalha(erroFetch(429, { statusMessage: 'Muitas tentativas.', data: { motivo: 'bloqueado', segundos: 840 } }))).toMatchObject({
      erro: 'Muitas tentativas.',
      motivo: 'bloqueado',
      segundos: 840,
    })
  })

  it('sem status (rede caiu): mensagem de conexão, não um «undefined»', () => {
    expect(traduzirErro(new Error('Failed to fetch')).message).toMatch(/conexão/)
  })
})

describe('criarClienteGestao', () => {
  const eco: Fetcher = async (url, o) => ({ url, ...o }) as never

  it('põe o Bearer quando há token e não põe quando a chamada é pública', async () => {
    const api = criarClienteGestao({ fetcher: eco, token: () => 'abc' })
    expect((await api.get<{ headers: Record<string, string> }>('/x')).headers).toEqual({ Authorization: 'Bearer abc' })
    expect((await api.post<{ headers?: unknown }>('/login', {}, { semToken: true })).headers).toBeUndefined()
  })

  it('401 em chamada autenticada avisa; 401 de login (senha errada) não derruba nada', async () => {
    let avisos = 0
    const falha: Fetcher = async () => {
      throw erroFetch(401, { statusMessage: 'E-mail ou senha incorretos.' })
    }
    const api = criarClienteGestao({ fetcher: falha, token: () => 'abc', aoSessaoExpirada: () => void avisos++ })
    await expect(api.post('/login', {}, { semToken: true })).rejects.toMatchObject({ status: 401 })
    expect(avisos).toBe(0)
    await expect(api.get('/sessao')).rejects.toMatchObject({ status: 401 })
    expect(avisos).toBe(1)
  })
})
