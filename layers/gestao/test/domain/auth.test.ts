import { describe, expect, it } from 'vitest'
import {
  aceitarConvite,
  autenticar,
  CODIGO_BLOQUEIO_DEMO_MS,
  CODIGO_BLOQUEIO_MS,
  CODIGO_REENVIO_MS,
  CODIGO_VALIDADE_MS,
  CONVITE_VALIDADE_MS,
  consultarConvite,
  criarConvite,
  emitirCodigo,
  ERRO_LOGIN,
  estadoAuthVazio,
  gerarCodigo,
  revogarConvite,
  segundosParaReenvio,
  semearContas,
  validarSenha,
  verificarCodigo,
  type EstadoAuth,
  type Sorteio,
} from '../../domain/auth'
import { SENHA_DEMO } from '../../domain/auth-demo'
import { USUARIOS } from '../../domain/seed'

/** Sorteio determinístico: sequência de bytes que se repete a partir de uma semente. */
function rngFixo(semente = 1): Sorteio {
  let s = semente
  return (n) => {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      out[i] = (s >> 16) & 0xff
    }
    return out
  }
}

const T0 = 1_800_000_000_000
const dono = { nome: 'Helena Duarte', perfil: 'dono' as const }
const juridico = { nome: 'Paulo Ribeiro', perfil: 'juridico' as const }
const SENHA = 'Chuva#Forte-9876x'

const congelar = <T>(o: T): T => {
  const f = (x: unknown): void => {
    if (x && typeof x === 'object') {
      Object.freeze(x)
      Object.values(x).forEach(f)
    }
  }
  f(o)
  return o
}

describe('validarSenha', () => {
  const ctx = { email: 'carlos.mendes@olmi.exemplo', nome: 'Carlos Mendes' }

  it('aceita senha que cumpre tudo', () => {
    const r = validarSenha(SENHA, ctx)
    expect(r.ok).toBe(true)
    expect(r.falhas).toEqual([])
  })

  it.each([
    ['curta', 'Ab1#xyzw', 'Pelo menos 12 caracteres'],
    ['sem maiúscula', 'chuva#forte-9876x', 'Uma letra maiúscula'],
    ['sem minúscula', 'CHUVA#FORTE-9876X', 'Uma letra minúscula'],
    ['sem número', 'Chuva#Forte-Xyzwvu', 'Um número'],
    ['sem símbolo', 'ChuvaForte9876xyz', 'Um símbolo (como ! @ # $ %)'],
  ])('recusa %s', (_n, senha, falha) => {
    const r = validarSenha(senha, ctx)
    expect(r.ok).toBe(false)
    expect(r.falhas).toContain(falha)
  })

  it('recusa senha com a parte local do e-mail, mesmo com acento ou caixa diferente', () => {
    expect(validarSenha('Xx#Carlos.Mendes-9876', ctx).falhas).toContain('Sem seu e-mail nem seu nome')
  })

  it('recusa senha com o nome (inclusive sem acento)', () => {
    expect(validarSenha('Xx#MENDES-9876-qz', { nome: 'Carlos Mendes' }).ok).toBe(false)
    expect(validarSenha('Xx#joao-9876-qzw', { nome: 'João Silva' }).falhas).toContain('Sem seu e-mail nem seu nome')
  })

  it('não confunde pedaços de 1-2 letras do nome com dado pessoal', () => {
    // "de" do nome «Ana de Souza» não pode reprovar toda senha com "de" dentro.
    expect(validarSenha('Chuva#de-Verao-9876', { nome: 'Ana de Souza' }).ok).toBe(true)
  })

  it('recusa senhas comuns que cumprem os caracteres', () => {
    expect(validarSenha('Senha@123456', {}).falhas).toContain('Não pode ser uma senha comum nem sequência')
    expect(validarSenha('Password#2024!!', {}).ok).toBe(false)
  })

  it('recusa sequências e repetições', () => {
    expect(validarSenha('Xk#9mQ-12345-wz', {}).ok).toBe(false)
    expect(validarSenha('Xk#9mQaaaaaa-wz', {}).ok).toBe(false)
  })

  it('força: vazia 0, parcial baixa, válida ≥ 3, longa 4', () => {
    expect(validarSenha('').forca).toBe(0)
    expect(validarSenha('abc').forca).toBeLessThan(2)
    expect(validarSenha(SENHA).forca).toBe(4)
    expect(validarSenha('Chuva#Fort9x').forca).toBe(3)
    expect(validarSenha('Chuva#Fort9x').ok).toBe(true)
  })

  it('a senha de demonstração cumpre as próprias regras', () => {
    expect(validarSenha(SENHA_DEMO).ok).toBe(true)
  })
})

describe('convites', () => {
  const base = (): EstadoAuth => congelar(estadoAuthVazio())

  it('cria convite com token aleatório, validade de 72 h e e-mail normalizado', () => {
    const r = criarConvite(base(), { email: '  Ana@Exemplo.COM ', perfil: 'corretor', convidante: dono }, { agora: T0, rng: rngFixo() })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.convite.email).toBe('ana@exemplo.com')
    expect(r.convite.token).toMatch(/^[0-9a-f]{64}$/)
    expect(r.convite.expiraEm - r.convite.criadoEm).toBe(CONVITE_VALIDADE_MS)
    expect(r.convite.perfil).toBe('corretor')
  })

  it('dois convites têm tokens diferentes', () => {
    const rng = rngFixo()
    const a = criarConvite(base(), { email: 'a@x.com', perfil: 'corretor', convidante: dono }, { agora: T0, rng })
    const b = criarConvite(base(), { email: 'b@x.com', perfil: 'corretor', convidante: dono }, { agora: T0, rng })
    if (!a.ok || !b.ok) throw new Error('esperado ok')
    expect(a.convite.token).not.toBe(b.convite.token)
  })

  it('recusa e-mail inválido e e-mail que já tem conta', () => {
    expect(criarConvite(base(), { email: 'sem-arroba', perfil: 'corretor', convidante: dono }).ok).toBe(false)
    const com = { ...estadoAuthVazio(), contas: [{ email: 'a@x.com', nome: 'A', perfil: 'corretor' as const, senhaHash: 'h', salt: 's' }] }
    const r = criarConvite(com, { email: 'A@x.com', perfil: 'corretor', convidante: dono })
    expect(r.ok).toBe(false)
  })

  it('jurídico NÃO convida dono; dono convida', () => {
    const r = criarConvite(base(), { email: 'a@x.com', perfil: 'dono', convidante: juridico })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/Só o Dono/)
    expect(criarConvite(base(), { email: 'a@x.com', perfil: 'dono', convidante: dono }).ok).toBe(true)
    expect(criarConvite(base(), { email: 'a@x.com', perfil: 'juridico', convidante: juridico }).ok).toBe(true)
  })

  it('novo convite para o mesmo e-mail cancela o anterior', () => {
    const rng = rngFixo()
    const a = criarConvite(base(), { email: 'a@x.com', perfil: 'corretor', convidante: dono }, { agora: T0, rng })
    if (!a.ok) throw new Error()
    const b = criarConvite(a.estado, { email: 'a@x.com', perfil: 'recepcao', convidante: dono }, { agora: T0 + 1000, rng })
    if (!b.ok) throw new Error()
    expect(consultarConvite(b.estado, a.convite.token, { agora: T0 + 2000 }).ok).toBe(false)
    expect(consultarConvite(b.estado, b.convite.token, { agora: T0 + 2000 }).ok).toBe(true)
  })

  it('não muta o estado de entrada', () => {
    const e = base()
    criarConvite(e, { email: 'a@x.com', perfil: 'corretor', convidante: dono })
    expect(e.convites).toHaveLength(0)
  })

  async function comConvite(perfil: 'corretor' | 'dono' = 'corretor') {
    const r = criarConvite(base(), { email: 'ana@exemplo.com', perfil, convidante: dono }, { agora: T0, rng: rngFixo() })
    if (!r.ok) throw new Error()
    return r
  }

  it('aceitar cria a conta com o perfil do CONVITE e guarda hash, não a senha', async () => {
    const { estado, convite } = await comConvite('corretor')
    const r = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + 1000, rng: rngFixo(9) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.conta.perfil).toBe('corretor')
    const conta = r.estado.contas[0]!
    expect(conta.senhaHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(r.estado)).not.toContain(SENHA)
  })

  it('uso único: o mesmo token não vale duas vezes', async () => {
    const { estado, convite } = await comConvite()
    const r1 = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + 1 })
    if (!r1.ok) throw new Error()
    const r2 = await aceitarConvite(r1.estado, { token: convite.token, nome: 'Outra', senha: SENHA }, { agora: T0 + 2 })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.motivo).toBe('usado')
    expect(r2.estado.contas).toHaveLength(1)
  })

  it('recusa convite expirado (72 h) e aceita no último instante', async () => {
    const { estado, convite } = await comConvite()
    const tarde = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + CONVITE_VALIDADE_MS })
    expect(tarde.ok).toBe(false)
    if (!tarde.ok) expect(tarde.motivo).toBe('expirado')
    const ok = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + CONVITE_VALIDADE_MS - 1 })
    expect(ok.ok).toBe(true)
  })

  it('recusa token inexistente, vazio e prefixo de token válido', async () => {
    const { estado, convite } = await comConvite()
    for (const token of ['', 'abc', convite.token.slice(0, 10)]) {
      const r = await aceitarConvite(estado, { token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + 1 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.motivo).toBe('inexistente')
    }
  })

  it('recusa convite revogado', async () => {
    const { estado, convite } = await comConvite()
    const rev = revogarConvite(estado, convite.token, { agora: T0 + 1 })
    if (!rev.ok) throw new Error()
    const r = await aceitarConvite(rev.estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('revogado')
  })

  it('não revoga convite já usado', async () => {
    const { estado, convite } = await comConvite()
    const r1 = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: SENHA }, { agora: T0 + 1 })
    if (!r1.ok) throw new Error()
    expect(revogarConvite(r1.estado, convite.token, { agora: T0 + 2 }).ok).toBe(false)
  })

  it('revalida a senha no aceite (não confia no botão da tela)', async () => {
    const { estado, convite } = await comConvite()
    const r = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: 'fraca' }, { agora: T0 + 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('senha')
    // e a senha que contém o e-mail do convite também cai
    const r2 = await aceitarConvite(estado, { token: convite.token, nome: 'Ana Lima', senha: 'Xx#ana@exemplo-9876' }, { agora: T0 + 1 })
    expect(r2.ok).toBe(false)
  })

  it('exige nome', async () => {
    const { estado, convite } = await comConvite()
    const r = await aceitarConvite(estado, { token: convite.token, nome: ' ', senha: SENHA }, { agora: T0 + 1 })
    expect(r.ok).toBe(false)
  })
})

describe('login (autenticar)', () => {
  async function estadoComConta() {
    return semearContas(USUARIOS, SENHA_DEMO, { rng: rngFixo(3) })
  }

  it('semeia uma conta por usuário e guarda só hash', async () => {
    const e = await estadoComConta()
    expect(e.contas).toHaveLength(USUARIOS.length)
    expect(JSON.stringify(e)).not.toContain(SENHA_DEMO)
    // sal por conta: mesma senha, hashes diferentes
    expect(new Set(e.contas.map((c) => c.senhaHash)).size).toBe(USUARIOS.length)
  })

  it('entra com e-mail (qualquer caixa) e senha certos', async () => {
    const e = await estadoComConta()
    const r = await autenticar(e, '  HELENA@olmi.exemplo ', SENHA_DEMO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.conta.perfil).toBe('dono')
  })

  it('senha errada e conta inexistente dão EXATAMENTE a mesma mensagem', async () => {
    const e = await estadoComConta()
    const errada = await autenticar(e, 'helena@olmi.exemplo', 'Errada#Senha-123')
    const inexistente = await autenticar(e, 'ninguem@olmi.exemplo', 'Errada#Senha-123')
    expect(errada.ok).toBe(false)
    expect(inexistente.ok).toBe(false)
    if (!errada.ok && !inexistente.ok) {
      expect(errada.erro).toBe(ERRO_LOGIN)
      expect(inexistente.erro).toBe(ERRO_LOGIN)
      expect(errada.motivo).toBe(inexistente.motivo)
    }
  })
})

describe('código de 2º fator', () => {
  const email = 'helena@olmi.exemplo'
  const emitir = async (agora = T0, estado?: EstadoAuth, seed = 5) => {
    const base = estado ?? (await semearContas(USUARIOS, SENHA_DEMO, { rng: rngFixo(3) }))
    const r = await emitirCodigo(base, email, { agora, rng: rngFixo(seed) })
    if (!r.ok) throw new Error(r.erro)
    return r
  }
  const errado = (codigo: string) => (codigo === '000000' ? '111111' : '000000')

  it('gera 6 dígitos, com zeros à esquerda', () => {
    expect(gerarCodigo(rngFixo(1))).toMatch(/^\d{6}$/)
    expect(gerarCodigo(() => new Uint8Array([0, 0, 0, 7]))).toBe('000007')
  })

  it('descarta o resto do módulo (sem viés) pedindo outro sorteio', () => {
    const seq = [new Uint8Array([255, 255, 255, 255]), new Uint8Array([0, 0, 0, 42])]
    let i = 0
    expect(gerarCodigo(() => seq[i++]!)).toBe('000042')
  })

  it('guarda só o hash do código', async () => {
    const r = await emitir()
    expect(r.codigo).toMatch(/^\d{6}$/)
    expect(JSON.stringify(r.estado.codigos)).not.toContain(r.codigo)
  })

  it('código certo → ok e uso único', async () => {
    const r = await emitir()
    const v = await verificarCodigo(r.estado, email, r.codigo, { agora: T0 + 1000 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.conta.perfil).toBe('dono')
    const reuso = await verificarCodigo(v.estado, email, r.codigo, { agora: T0 + 2000 })
    expect(reuso.ok).toBe(false)
  })

  it('expira em 10 min', async () => {
    const r = await emitir()
    const v = await verificarCodigo(r.estado, email, r.codigo, { agora: T0 + CODIGO_VALIDADE_MS })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toBe('expirado')
    expect((await verificarCodigo(r.estado, email, r.codigo, { agora: T0 + CODIGO_VALIDADE_MS - 1 })).ok).toBe(true)
  })

  it('conta tentativas erradas e informa quantas restam', async () => {
    const r = await emitir()
    const v = await verificarCodigo(r.estado, email, errado(r.codigo), { agora: T0 + 1 })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.motivo).toBe('invalido')
      expect(v.restantes).toBe(4)
      expect(v.estado.codigos[0]!.tentativas).toBe(1)
    }
  })

  it('5 erros bloqueiam — e o código CERTO depois do bloqueio também é recusado', async () => {
    let { estado, codigo } = await emitir()
    let ultimo
    for (let i = 0; i < 5; i++) {
      ultimo = await verificarCodigo(estado, email, errado(codigo), { agora: T0 + 1000 + i })
      estado = ultimo.estado
    }
    expect(ultimo!.ok).toBe(false)
    if (!ultimo!.ok) expect(ultimo!.motivo).toBe('bloqueado')
    const certo = await verificarCodigo(estado, email, codigo, { agora: T0 + 6000 })
    expect(certo.ok).toBe(false)
    if (!certo.ok) expect(certo.motivo).toBe('bloqueado')
  })

  it('pedir outro código não zera o bloqueio', async () => {
    let { estado, codigo } = await emitir()
    for (let i = 0; i < 5; i++) estado = (await verificarCodigo(estado, email, errado(codigo), { agora: T0 + 1000 })).estado
    const novo = await emitirCodigo(estado, email, { agora: T0 + CODIGO_REENVIO_MS + 5000, rng: rngFixo(8) })
    expect(novo.ok).toBe(false)
    if (!novo.ok) expect(novo.motivo).toBe('bloqueado')
    const depois = await emitirCodigo(estado, email, { agora: T0 + 1000 + CODIGO_BLOQUEIO_MS, rng: rngFixo(8) })
    expect(depois.ok).toBe(true)
  })

  it('reenvio só depois de 60 s', async () => {
    const r = await emitir()
    expect(segundosParaReenvio(r.estado, email, T0 + 10_000)).toBe(50)
    const cedo = await emitirCodigo(r.estado, email, { agora: T0 + CODIGO_REENVIO_MS - 1, rng: rngFixo(7) })
    expect(cedo.ok).toBe(false)
    if (!cedo.ok) expect(cedo.motivo).toBe('aguarde')
    const ok = await emitirCodigo(r.estado, email, { agora: T0 + CODIGO_REENVIO_MS, rng: rngFixo(7) })
    expect(ok.ok).toBe(true)
  })

  it('código já usado não impõe espera: novo login logo depois emite outro', async () => {
    const r = await emitir()
    const v = await verificarCodigo(r.estado, email, r.codigo, { agora: T0 + 1000 })
    if (!v.ok) throw new Error()
    const novo = await emitirCodigo(v.estado, email, { agora: T0 + 2000, rng: rngFixo(9) })
    expect(novo.ok).toBe(true)
  })

  it('o código novo invalida o anterior', async () => {
    const a = await emitir(T0)
    const b = await emitirCodigo(a.estado, email, { agora: T0 + CODIGO_REENVIO_MS, rng: rngFixo(77) })
    if (!b.ok) throw new Error()
    expect(b.estado.codigos).toHaveLength(1)
    const velho = await verificarCodigo(b.estado, email, a.codigo, { agora: T0 + CODIGO_REENVIO_MS + 1 })
    expect(velho.ok).toBe(false)
    expect((await verificarCodigo(b.estado, email, b.codigo, { agora: T0 + CODIGO_REENVIO_MS + 1 })).ok).toBe(true)
  })

  it('e-mail sem código pendente: mensagem genérica', async () => {
    const e = await semearContas(USUARIOS, SENHA_DEMO, { rng: rngFixo(3) })
    const v = await verificarCodigo(e, email, '123456', { agora: T0 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toBe('inexistente')
  })

  it('não muta o estado de entrada', async () => {
    const e = congelar(await semearContas(USUARIOS, SENHA_DEMO, { rng: rngFixo(3) }))
    const r = await emitirCodigo(e, email, { agora: T0, rng: rngFixo(5) })
    if (!r.ok) throw new Error()
    congelar(r.estado)
    await verificarCodigo(r.estado, email, errado(r.codigo), { agora: T0 + 1 })
    await autenticar(e, email, 'x')
    expect(e.codigos).toHaveLength(0)
    expect(r.estado.codigos[0]!.tentativas).toBe(0)
  })

  describe('bloqueio por tentativas', () => {
    const bloquear = async (bloqueioMs?: number) => {
      let { estado, codigo } = await emitir()
      let ultimo
      for (let i = 0; i < 5; i++) {
        ultimo = await verificarCodigo(estado, email, errado(codigo), { agora: T0 + 1000, bloqueioMs })
        estado = ultimo.estado
      }
      return { estado, codigo, ultimo: ultimo! }
    }

    it('a mensagem diz em quantos minutos tentar de novo (15 fora do demo)', async () => {
      const { ultimo } = await bloquear()
      expect(ultimo.ok).toBe(false)
      if (!ultimo.ok) expect(ultimo.erro).toContain('Tente de novo em 15 minutos')
    })

    it('no demo o bloqueio é de 5 minutos', async () => {
      const { estado, codigo, ultimo } = await bloquear(CODIGO_BLOQUEIO_DEMO_MS)
      if (!ultimo.ok) expect(ultimo.erro).toContain('em 5 minutos')
      // 1 min depois: ainda dentro do prazo, e o código certo continua recusado
      const dentro = await verificarCodigo(estado, email, codigo, { agora: T0 + 1000 + 60_000, bloqueioMs: CODIGO_BLOQUEIO_DEMO_MS })
      expect(dentro.ok).toBe(false)
      if (!dentro.ok) {
        expect(dentro.motivo).toBe('bloqueado')
        expect(dentro.erro).toContain('em 4 minutos')
      }
    })

    it('expirado o prazo, o código certo entra (se o código ainda vale)', async () => {
      const { estado, codigo } = await bloquear(CODIGO_BLOQUEIO_DEMO_MS)
      const v = await verificarCodigo(estado, email, codigo, { agora: T0 + 1000 + CODIGO_BLOQUEIO_DEMO_MS, bloqueioMs: CODIGO_BLOQUEIO_DEMO_MS })
      expect(v.ok).toBe(true)
      if (v.ok) expect(v.estado.codigos[0]!.tentativas).toBe(0)
    })

    it('expirado o prazo, um erro NÃO bloqueia de novo na hora (tentativas zeradas)', async () => {
      const { estado, codigo } = await bloquear(CODIGO_BLOQUEIO_DEMO_MS)
      const v = await verificarCodigo(estado, email, errado(codigo), { agora: T0 + 1000 + CODIGO_BLOQUEIO_DEMO_MS, bloqueioMs: CODIGO_BLOQUEIO_DEMO_MS })
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.motivo).toBe('invalido')
        expect(v.restantes).toBe(4)
      }
    })

    it('código certo zera as tentativas anteriores', async () => {
      const r = await emitir()
      const e1 = await verificarCodigo(r.estado, email, errado(r.codigo), { agora: T0 + 1 })
      const ok = await verificarCodigo(e1.estado, email, r.codigo, { agora: T0 + 2 })
      expect(ok.ok).toBe(true)
      expect(ok.estado.codigos[0]!.tentativas).toBe(0)
    })

    it('novo código só sai depois do prazo; então um código novo entra', async () => {
      const { estado } = await bloquear(CODIGO_BLOQUEIO_DEMO_MS)
      const cedo = await emitirCodigo(estado, email, { agora: T0 + 1000 + 120_000, rng: rngFixo(8), bloqueioMs: CODIGO_BLOQUEIO_DEMO_MS })
      expect(cedo.ok).toBe(false)
      const tarde = await emitirCodigo(estado, email, { agora: T0 + 1000 + CODIGO_BLOQUEIO_DEMO_MS, rng: rngFixo(8) })
      expect(tarde.ok).toBe(true)
    })
  })
})
